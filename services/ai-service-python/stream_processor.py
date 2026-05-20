import cv2
import time
import threading
import requests
import os
import numpy as np
from queue import Queue
from urllib.parse import urlsplit, urlunsplit

class StreamProcessor:
    def __init__(self, camera_id, rtsp_url, api_url, service_token):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.api_url = api_url
        self.service_token = service_token
        self.running = False
        self.thread = None
        self.capture_thread = None
        self.process_fps = max(0.2, float(os.getenv("AI_PROCESS_FPS", "2")))
        self.frame_width = max(160, int(os.getenv("AI_FRAME_WIDTH", "320")))
        self.frame_height = max(90, int(os.getenv("AI_FRAME_HEIGHT", "180")))
        self.motion_pixels_threshold = max(1, int(os.getenv("AI_MOTION_PIXELS_THRESHOLD", "1800")))
        self.motion_debounce_seconds = max(5, int(os.getenv("AI_MOTION_DEBOUNCE_SECONDS", "30")))
        self.frame_queue = Queue(maxsize=1)
        self.last_event_time = 0
        self.last_seen = 0

    def start(self):
        if self.running:
            return
        self.running = True
        
        # Thread de captura
        self.capture_thread = threading.Thread(target=self._capture_frames)
        self.capture_thread.daemon = True
        self.capture_thread.start()
        
        # Thread de processamento
        self.thread = threading.Thread(target=self._process)
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.running = False
        if self.capture_thread:
            self.capture_thread.join(timeout=2)
        if self.thread:
            self.thread.join(timeout=2)

    def _sanitize_url(self, url):
        try:
            parsed = urlsplit(url)
            if "@" not in parsed.netloc:
                return url
            safe_netloc = f"***:***@{parsed.netloc.rsplit('@', 1)[1]}"
            return urlunsplit((parsed.scheme, safe_netloc, parsed.path, parsed.query, parsed.fragment))
        except Exception:
            return "<rtsp-url-redacted>"

    def _capture_frames(self):
        print(f"[{self.camera_id}] Iniciando captura: {self._sanitize_url(self.rtsp_url)}")
        cap = self._open_capture()
        capture_interval = 1.0 / self.process_fps
        
        while self.running:
            ret, frame = cap.read()
            if not ret:
                print(f"[{self.camera_id}] Falha na captura, reconectando em 5s...")
                cap.release()
                time.sleep(5)
                cap = self._open_capture()
                continue
            
            self.last_seen = time.time()
            
            if not self.frame_queue.full():
                self.frame_queue.put(frame)
            else:
                # Se a fila estiver cheia, descarta o frame antigo para manter o tempo real
                try:
                    self.frame_queue.get_nowait()
                    self.frame_queue.put(frame)
                except:
                    pass

            time.sleep(capture_interval)
        
        cap.release()

    def _open_capture(self):
        cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _process(self):
        print(f"[{self.camera_id}] Iniciando processamento de movimento ({self.process_fps} fps, {self.frame_width}x{self.frame_height})...")
        fgbg = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=True)
        
        while self.running:
            if self.frame_queue.empty():
                time.sleep(0.01)
                continue
                
            frame = self.frame_queue.get()
            
            # Reduzir resolução para processamento rápido (mais eficiente para IA local)
            small_frame = cv2.resize(frame, (self.frame_width, self.frame_height))
            fgmask = fgbg.apply(small_frame)
            
            # Limpeza de ruído morfológica
            kernel = np.ones((5,5), np.uint8)
            fgmask = cv2.morphologyEx(fgmask, cv2.MORPH_OPEN, kernel)
            
            # Contagem de pixels de movimento
            motion_pixels = np.count_nonzero(fgmask)
            
            if motion_pixels > self.motion_pixels_threshold: 
                current_time = time.time()
                if current_time - self.last_event_time > self.motion_debounce_seconds:
                    self._report_event("MOTION_DETECTED", motion_pixels)
                    self.last_event_time = current_time

            # Pequena pausa para aliviar CPU em sistemas standalone
            time.sleep(0.02)

    def _report_event(self, event_type, value):
        print(f"[{self.camera_id}] Evento: {event_type} ({value})")
        try:
            url = f"{self.api_url}/cameras/internal/{self.camera_id}/events"
            payload = {
                "type": event_type,
                "value": str(value),
                "occurredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            headers = {"X-Service-Token": self.service_token}
            # Timeout curto para não travar a thread de IA
            response = requests.post(url, json=payload, headers=headers, timeout=3)
            if response.status_code not in [200, 201]:
                print(f"[{self.camera_id}] Erro API: {response.status_code}")
        except Exception as e:
            print(f"[{self.camera_id}] Falha de conexão com API: {e}")
