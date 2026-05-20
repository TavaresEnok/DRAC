from fastapi import FastAPI, HTTPException, Header
import os
import uvicorn
from pydantic import BaseModel
from typing import Optional, Dict
import hmac
from stream_processor import StreamProcessor

app = FastAPI(title="VMS AI Service", description="AI analysis service for VMS Drac")

# Gerenciador de processos ativos
processors: Dict[str, StreamProcessor] = {}

class AnalysisRequest(BaseModel):
    camera_id: str
    rtsp_url: str
    analysis_type: str  # 'motion', 'object', 'face'


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
    }

@app.post("/analyze/start")
async def start_analysis(request: AnalysisRequest, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    if request.camera_id in processors:
        return {"status": "already_running", "camera_id": request.camera_id}
    
    api_url = os.getenv("API_URL", "http://api:3000")
    service_token = os.getenv("INTERNAL_SERVICE_TOKEN", "change_me_service_token")
    
    processor = StreamProcessor(request.camera_id, request.rtsp_url, api_url, service_token)
    processor.start()
    processors[request.camera_id] = processor
    
    return {"status": "started", "camera_id": request.camera_id}

@app.post("/analyze/stop/{camera_id}")
async def stop_analysis(camera_id: str, x_service_token: Optional[str] = Header(default=None)):
    validate_internal_token(x_service_token)
    if camera_id not in processors:
        raise HTTPException(status_code=404, detail="Processador não encontrado")
    
    processor = processors.pop(camera_id)
    processor.stop()
    
    return {"status": "stopped", "camera_id": camera_id}

if __name__ == "__main__":
    port = int(os.getenv("AI_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
