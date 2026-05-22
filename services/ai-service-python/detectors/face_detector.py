import os

from .base import Detection, Detector


class FaceDetector(Detector):
    event_type = "FACE_DETECTED"

    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}
        self.pack = os.getenv("AI_FACE_PACK", "buffalo_s")
        self.min_conf = float(os.getenv("AI_FACE_MIN_CONF", "0.5"))
        self.det_size = int(os.getenv("AI_FACE_DET_SIZE", "640"))
        self.app = None

    def load(self) -> None:
        if self.app is not None:
            return
        try:
            from insightface.app import FaceAnalysis
        except Exception as exc:
            raise RuntimeError("Dependência insightface ausente para FaceDetector.") from exc

        self.app = FaceAnalysis(
            name=self.pack,
            root=os.getenv("AI_MODELS_DIR", "/app/models"),
            providers=["CPUExecutionProvider"],
            allowed_modules=["detection"],
        )
        self.app.prepare(ctx_id=-1, det_size=(self.det_size, self.det_size))

    def infer(self, frame) -> list[Detection]:
        if self.app is None:
            self.load()

        faces = self.app.get(frame)
        detections: list[Detection] = []
        for face in faces:
            score = float(getattr(face, "det_score", 0.0))
            if score < self.min_conf:
                continue
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            landmarks = face.kps.tolist() if getattr(face, "kps", None) is not None else None
            detections.append(
                Detection(
                    label="face",
                    confidence=score,
                    bbox=[x1, y1, x2, y2],
                    landmarks=landmarks,
                )
            )
        return detections
