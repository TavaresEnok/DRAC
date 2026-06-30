import threading
from .base import Detection, Detector
from onnxruntime_session import configure_insightface_onnxruntime
from runtime_profiles import FACE_PROFILE, onnxruntime_providers, runtime_uses_gpu


class FaceDetector(Detector):
    event_type = "FACE_DETECTED"

    def __init__(self):
        self._pack = FACE_PROFILE["pack"]
        self.min_conf = float(FACE_PROFILE["confidence"])
        self.det_size = int(FACE_PROFILE["detector_size"])
        self._models_dir = "/app/models"
        self._app = None    # FaceAnalysis (carregado em load())
        self._infer_lock = threading.Lock()
        # Default: CPU (idêntico ao comportamento atual). Vira CUDA automaticamente
        # se o serviço subir com FACE_RUNTIME=onnxruntime_cuda numa imagem com
        # onnxruntime-gpu. Dormente por padrão.
        self._runtime = str(FACE_PROFILE.get("runtime", "onnxruntime_cpu"))
        self._providers = onnxruntime_providers(self._runtime)
        self._ctx_id = 0 if runtime_uses_gpu(self._runtime) else -1

    def load(self) -> None:
        if self._app is not None:
            return
        try:
            from insightface.app import FaceAnalysis
        except Exception as exc:
            raise RuntimeError("Dependência insightface ausente para FaceDetector.") from exc

        configure_insightface_onnxruntime()

        self._app = FaceAnalysis(
            name=self._pack,
            root=self._models_dir,
            providers=self._providers,
            allowed_modules=["detection"],  # carrega apenas o modelo de detecção
        )
        self._app.prepare(ctx_id=self._ctx_id, det_size=(self.det_size, self.det_size))
        print(f"[FaceDetector] Carregado model='scrfd_500m' runtime='{self._runtime}' providers={self._providers} det_size={self.det_size} confidence={self.min_conf}")

    def close(self) -> None:
        self._app = None

    def infer(self, frame, context_key: str | None = None, **kwargs) -> list[Detection]:
        if self._app is None:
            self.load()

        # A FaceAnalysis instance is shared between cameras for the same
        # profile; guard its synchronous ONNX inference session.
        with self._infer_lock:
            faces = self._app.get(frame)
        out: list[Detection] = []
        for face in faces:
            score = float(getattr(face, "det_score", 0.0))
            if score < self.min_conf:
                continue
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            landmarks = face.kps.tolist() if getattr(face, "kps", None) is not None else None
            out.append(Detection(
                label="face",
                confidence=score,
                bbox=[x1, y1, x2, y2],
                landmarks=landmarks,
            ))
        return out
