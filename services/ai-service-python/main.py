from fastapi import FastAPI, HTTPException, BackgroundTasks
import os
import uvicorn
from pydantic import BaseModel
from typing import Optional, Dict
from stream_processor import StreamProcessor

app = FastAPI(title="VMS AI Service", description="AI analysis service for VMS Drac")

# Gerenciador de processos ativos
processors: Dict[str, StreamProcessor] = {}

class AnalysisRequest(BaseModel):
    camera_id: str
    rtsp_url: str
    analysis_type: str  # 'motion', 'object', 'face'

@app.get("/health")
def health_check():
    return {"status": "online", "service": "ai-service", "active_processors": list(processors.keys())}

@app.post("/analyze/start")
async def start_analysis(request: AnalysisRequest):
    if request.camera_id in processors:
        return {"status": "already_running", "camera_id": request.camera_id}
    
    api_url = os.getenv("API_URL", "http://api:3000")
    service_token = os.getenv("INTERNAL_SERVICE_TOKEN", "change_me_service_token")
    
    processor = StreamProcessor(request.camera_id, request.rtsp_url, api_url, service_token)
    processor.start()
    processors[request.camera_id] = processor
    
    return {"status": "started", "camera_id": request.camera_id}

@app.post("/analyze/stop/{camera_id}")
async def stop_analysis(camera_id: str):
    if camera_id not in processors:
        raise HTTPException(status_code=404, detail="Processador não encontrado")
    
    processor = processors.pop(camera_id)
    processor.stop()
    
    return {"status": "stopped", "camera_id": camera_id}

if __name__ == "__main__":
    port = int(os.getenv("AI_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
