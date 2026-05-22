import threading
import time

from detectors import build_detector


class ModelRegistry:
    def __init__(self):
        self._lock = threading.RLock()
        self._mode = None
        self._detector = None
        self._loaded_at = None
        self.last_error = None

    @property
    def mode(self):
        return self._mode

    @property
    def event_type(self):
        return getattr(self._detector, "event_type", "GENERIC")

    def ensure_mode(self, analysis_type: str):
        mode = (analysis_type or "motion").strip().lower()
        with self._lock:
            if self._detector is not None and self._mode == mode:
                return self._detector
            if self._detector is not None:
                try:
                    self._detector.close()
                except Exception:
                    pass
            self._detector = build_detector(mode, {})
            self._detector.load()
            self._mode = mode
            self._loaded_at = time.time()
            self.last_error = None
            return self._detector

    def reset(self):
        with self._lock:
            if self._detector is not None:
                try:
                    self._detector.close()
                except Exception:
                    pass
            self._detector = None
            self._mode = None
            self._loaded_at = None
            self.last_error = None

    def infer(self, analysis_type: str, frame):
        detector = self.ensure_mode(analysis_type)
        with self._lock:
            return detector.infer(frame)

    def status(self):
        return {
            "mode": self._mode,
            "loaded": self._detector is not None,
            "loadedAt": self._loaded_at,
            "lastError": self.last_error,
        }


registry = ModelRegistry()
