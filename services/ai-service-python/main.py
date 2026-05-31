from fastapi import FastAPI, HTTPException, Header, Query
import os
import uvicorn
from pydantic import BaseModel
from typing import Any, Optional, Dict
import hmac
from stream_processor import StreamProcessor
from model_registry import registry
from runtime_profiles import exposed_profiles
from onnxruntime_session import inference_threading_status

app = FastAPI(title="VMS AI Service", description="AI analysis service for VMS Drac")

# Gerenciador de processos ativos
processors: Dict[str, StreamProcessor] = {}

class AnalysisRequest(BaseModel):
    camera_id: str
    rtsp_url: str
    analysis_type: str  # 'motion' = base only; 'face' and 'general' run with motion too.
    source_info: Optional[Dict[str, Any]] = None


class ModeRequest(BaseModel):
    analysis_type: str


class LiveViewLeaseRequest(BaseModel):
    session_id: str
    ttl_seconds: int = 20
    view_mode: str = "grid"


def validate_internal_token(x_service_token: Optional[str]):
    expected = (os.getenv("INTERNAL_SERVICE_TOKEN", "") or "").strip()
    if not expected or expected == "change_me_service_token" or len(expected) < 24:
        raise HTTPException(status_code=503, detail="INTERNAL_SERVICE_TOKEN inválido no serviço.")
    if not x_service_token or not hmac.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="Token interno inválido.")

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "ai-service",
        "active_processors": list(processors.keys()),
        "static_profiles": exposed_profiles(),
        "model_registry": registry.status(),
        "inference_threading": inference_threading_status(),
        "processors": {
            camera_id: {
                "analysis_type": processor.analysis_type,
                "base_motion_enabled": True,
                "advanced_analysis_type": processor.advanced_analysis_type,
                "runtime_profile": processor.profile,
                "process_fps": processor.process_fps,
                "advanced_process_fps": processor.advanced_process_fps,
                "last_seen": processor.last_seen,
                "last_error": processor.last_error,
                "running": processor.running,
                "live_snapshot_count": len(processor.get_live_snapshot(max_age_ms=15000, limit=100)),
                "capture_frames_enqueued": processor.capture_frames_enqueued,
                "capture_frames_dropped": processor.capture_frames_dropped,
                "source": processor.source_state(),
                "stream": processor.capture_stream_state(),
                "motion_trigger": processor.motion_trigger,
                "wakeup_until": processor.wakeup_until,
                "hibernating": processor.motion_trigger == "CAMERA" and __import__("time").time() >= processor.wakeup_until,
                "live_view": processor.live_view_state(),
                "performance": processor.performance_state(),
            }
            for camera_id, processor in processors.items()
        },
    }


@app.get("/detections/latest/{camera_id}")
async def latest_detections(
    camera_id: str,
    max_age_ms: int = Query(default=5000, ge=200, le=30000),
    limit: int = Query(default=12, ge=1, le=50),
    x_service_token: Optional[str] = Header(default=None),
):
    validate_internal_token(x_service_token)
    processor = processors.get(camera_id)
    if processor is None:
        return {"status": "not_running", "camera_id": camera_id, "detections": []}
    return {
        "status": "ok",
        "camera_id": camera_id,
        "detections": processor.get_live_snapshot(max_age_ms=max_age_ms, limit=limit),
    }

@app.post("/analyze/start")
async def start_analysis(request: AnalysisRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    if request.camera_id in processors:
        return {"status": "already_running", "camera_id": request.camera_id}
    
    api_url = os.getenv("API_URL", "http://api:3000")
    service_token = os.getenv("INTERNAL_SERVICE_TOKEN", "change_me_service_token")
    
    processor = StreamProcessor(
        request.camera_id,
        request.rtsp_url,
        api_url,
        service_token,
        request.analysis_type,
        request.source_info or {},
    )
    processor.start()
    processors[request.camera_id] = processor
    
    return {"status": "started", "camera_id": request.camera_id, "analysis_type": request.analysis_type}

@app.post("/analyze/stop/{camera_id}")
async def stop_analysis(camera_id: str, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    if camera_id not in processors:
        raise HTTPException(status_code=404, detail="Processador não encontrado")
    
    processor = processors.pop(camera_id)
    processor.stop()
    
    return {"status": "stopped", "camera_id": camera_id}

@app.post("/analyze/wakeup/{camera_id}")
async def wakeup_camera(camera_id: str, duration_seconds: int = Query(20, ge=5, le=300), x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    processor = processors.get(camera_id)
    if not processor:
        raise HTTPException(status_code=404, detail="Processador não encontrado")
    import time
    now = time.time()
    if now < processor.wakeup_until:
        return {"status": "already_awake", "camera_id": camera_id, "until": processor.wakeup_until}
    processor.wakeup_until = time.time() + duration_seconds
    return {"status": "awoken", "camera_id": camera_id, "until": processor.wakeup_until}


@app.post("/live-view/start/{camera_id}")
async def start_live_view(camera_id: str, request: LiveViewLeaseRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    processor = processors.get(camera_id)
    if not processor:
        return {"status": "not_running", "camera_id": camera_id, "session_id": request.session_id}
    try:
        lease = processor.touch_live_view_session(request.session_id, request.ttl_seconds, request.view_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"camera_id": camera_id, **lease}


@app.post("/live-view/heartbeat/{camera_id}")
async def heartbeat_live_view(camera_id: str, request: LiveViewLeaseRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    processor = processors.get(camera_id)
    if not processor:
        return {"status": "not_running", "camera_id": camera_id, "session_id": request.session_id}
    try:
        lease = processor.touch_live_view_session(request.session_id, request.ttl_seconds, request.view_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"camera_id": camera_id, **lease}


@app.post("/live-view/stop/{camera_id}")
async def stop_live_view(camera_id: str, request: LiveViewLeaseRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    processor = processors.get(camera_id)
    if not processor:
        return {"status": "not_running", "camera_id": camera_id, "session_id": request.session_id}
    try:
        lease = processor.stop_live_view_session(request.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"camera_id": camera_id, **lease}


@app.post("/analyze/stop-all")
async def stop_all(x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    stopped = []
    for camera_id, processor in list(processors.items()):
        processors.pop(camera_id, None)
        processor.stop()
        stopped.append(camera_id)
    return {"status": "stopped", "camera_ids": stopped}


@app.post("/models/reset")
async def reset_models(x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    registry.reset()
    return {"status": "reset"}


@app.post("/models/load")
async def load_model(request: ModeRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    try:
        registry.ensure_mode(request.analysis_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "loaded", "model_registry": registry.status()}


if __name__ == "__main__":
    port = int(os.getenv("AI_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
