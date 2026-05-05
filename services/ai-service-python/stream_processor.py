import cv2
import time
import threading
import requests
import os
import numpy as np
from queue import Queue

class StreamProcessor:
    def __init__(self, camera_id, rtsp_url, api_url, service_token):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.api_url = api_url
        self.service_token = service_token
        self.running = False
        self.thread = None
        self.capture_thread = None
        self.frame_queue = Queue(maxsize=5)
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

    def _capture_frames(self):
        print(f"[{self.camera_id}] Iniciando captura: {self.rtsp_url}")
        cap = cv2.VideoCapture(self.rtsp_url)
        
        while self.running:
            ret, frame = cap.read()
            if not ret:
                print(f"[{self.camera_id}] Falha na captura, reconectando em 5s...")
                cap.release()
                time.sleep(5)
                cap = cv2.VideoCapture(self.rtsp_url)
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
        
        cap.release()

    def _process(self):
        print(f"[{self.camera_id}] Iniciando processamento de movimento...")
        fgbg = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=True)
        
        while self.running:
            if self.frame_queue.empty():
                time.sleep(0.01)
                continue
                
            frame = self.frame_queue.get()
            
            # Reduzir resolução para processamento rápido (mais eficiente para IA local)
            small_frame = cv2.resize(frame, (640, 360))
            fgmask = fgbg.apply(small_frame)
            
            # Limpeza de ruído morfológica
            kernel = np.ones((5,5), np.uint8)
            fgmask = cv2.morphologyEx(fgmask, cv2.MORPH_OPEN, kernel)
            
            # Contagem de pixels de movimento
            motion_pixels = np.count_nonzero(fgmask)
            
            # Se mais de 1% da tela mudou
            if motion_pixels > 8000: 
                current_time = time.time()
                if current_time - self.last_event_time > 15:  # Debounce de 15 segundos
                    self._report_event("MOTION_DETECTED", motion_pixels)
                    self.last_event_time = current_time

            # Pequena pausa para aliviar CPU em sistemas standalone
            time.sleep(0.05)

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
