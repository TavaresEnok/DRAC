import os

from gallery import Gallery

from .base import Detection, Detector


class RecognitionPipeline(Detector):
    event_type = "FACE_RECOGNIZED"

    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}
        self.pack = os.getenv("AI_FACE_PACK_REC", "buffalo_l")
        self.det_size = int(os.getenv("AI_FACE_DET_SIZE", "640"))
        self.min_conf = float(os.getenv("AI_FACE_MIN_CONF", "0.5"))
        self.threshold = float(os.getenv("AI_REC_THRESHOLD", "0.35"))
        self.app = None
        self.gallery = Gallery()

    def load(self) -> None:
        if self.app is not None:
            return
        try:
            from insightface.app import FaceAnalysis
        except Exception as exc:
            raise RuntimeError("Dependência insightface ausente para FaceRecognizer.") from exc

        self.app = FaceAnalysis(
            name=self.pack,
            root=os.getenv("AI_MODELS_DIR", "/app/models"),
            providers=["CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=-1, det_size=(self.det_size, self.det_size))
        self.gallery.refresh(force=True)

    def infer(self, frame) -> list[Detection]:
        if self.app is None:
            self.load()

        faces = self.app.get(frame)
        detections: list[Detection] = []
        for face in faces:
            det_score = float(getattr(face, "det_score", 0.0))
            if det_score < self.min_conf:
                continue

            embedding = getattr(face, "normed_embedding", None)
            person_id, name, similarity = self.gallery.match(embedding, self.threshold) if embedding is not None else (None, None, 0.0)
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            recognized = bool(name)
            detections.append(
                Detection(
                    label=name or "desconhecido",
                    confidence=det_score,
                    bbox=[x1, y1, x2, y2],
                    landmarks=face.kps.tolist() if getattr(face, "kps", None) is not None else None,
                    event_type="FACE_RECOGNIZED" if recognized else "FACE_UNKNOWN",
                    extra={
                        "personId": person_id,
                        "name": name,
                        "similarity": round(similarity, 4),
                        "recognized": recognized,
                    },
                )
            )
        return detections
