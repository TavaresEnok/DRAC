from fastapi import FastAPI, HTTPException, Header, UploadFile, File
import os
import uvicorn
from pydantic import BaseModel
from typing import Optional, Dict
import hmac
from stream_processor import StreamProcessor
from model_registry import registry

app = FastAPI(title="VMS AI Service", description="AI analysis service for VMS Drac")

# Gerenciador de processos ativos
processors: Dict[str, StreamProcessor] = {}

class AnalysisRequest(BaseModel):
    camera_id: str
    rtsp_url: str
    analysis_type: str  # 'motion', 'face', 'general', 'recognition'


class ModeRequest(BaseModel):
    analysis_type: str


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
        "process_fps": os.getenv("AI_PROCESS_FPS", "2"),
        "frame_size": f"{os.getenv('AI_FRAME_WIDTH', '320')}x{os.getenv('AI_FRAME_HEIGHT', '180')}",
        "motion_debounce_seconds": os.getenv("AI_MOTION_DEBOUNCE_SECONDS", "30"),
        "detect_debounce_seconds": os.getenv("AI_DETECT_DEBOUNCE_SECONDS", "10"),
        "model_registry": registry.status(),
        "processors": {
            camera_id: {
                "analysis_type": processor.analysis_type,
                "last_seen": processor.last_seen,
                "running": processor.running,
            }
            for camera_id, processor in processors.items()
        },
    }

@app.post("/analyze/start")
async def start_analysis(request: AnalysisRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    if request.camera_id in processors:
        return {"status": "already_running", "camera_id": request.camera_id}
    
    api_url = os.getenv("API_URL", "http://api:3000")
    service_token = os.getenv("INTERNAL_SERVICE_TOKEN", "change_me_service_token")
    
    processor = StreamProcessor(request.camera_id, request.rtsp_url, api_url, service_token, request.analysis_type)
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


_embed_app = None


def get_embed_app():
    global _embed_app
    if _embed_app is not None:
        return _embed_app
    try:
        from insightface.app import FaceAnalysis
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"insightface indisponível: {exc}")
    pack = os.getenv("AI_FACE_PACK_REC", "buffalo_l")
    det_size = int(os.getenv("AI_FACE_DET_SIZE", "640"))
    app_rec = FaceAnalysis(
        name=pack,
        root=os.getenv("AI_MODELS_DIR", "/app/models"),
        providers=["CPUExecutionProvider"],
    )
    app_rec.prepare(ctx_id=-1, det_size=(det_size, det_size))
    _embed_app = app_rec
    return _embed_app


@app.post("/embed")
async def embed(file: UploadFile = File(...), x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    try:
        import cv2
        import numpy as np
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"opencv/numpy indisponível: {exc}")

    raw = await file.read()
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail="Imagem inválida.")

    faces = get_embed_app().get(img)
    if not faces:
        raise HTTPException(status_code=422, detail="Nenhum rosto detectado na imagem.")
    face = max(faces, key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))
    embedding = getattr(face, "normed_embedding", None)
    if embedding is None:
        raise HTTPException(status_code=422, detail="Não foi possível gerar embedding facial.")
    return {
        "embedding": embedding.tolist(),
        "detScore": float(getattr(face, "det_score", 0.0)),
        "bbox": [int(v) for v in face.bbox],
    }

if __name__ == "__main__":
    port = int(os.getenv("AI_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
