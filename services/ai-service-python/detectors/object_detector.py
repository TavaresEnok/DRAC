import os

from .base import Detection, Detector


COCO_KEEP = {
    0: "pessoa",
    1: "bicicleta",
    2: "carro",
    3: "moto",
    5: "onibus",
    7: "caminhao",
}


class ObjectDetector(Detector):
    event_type = "OBJECT_DETECTED"

    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}
        self.model_path = os.getenv(
            "AI_YOLO_MODEL",
            os.path.join(os.getenv("AI_MODELS_DIR", "/app/models"), "yolo11n_openvino_model"),
        )
        self.min_conf = float(os.getenv("AI_OBJ_MIN_CONF", "0.4"))
        self.model = None

    def load(self) -> None:
        if self.model is not None:
            return
        try:
            from ultralytics import YOLO
        except Exception as exc:
            raise RuntimeError("Dependência ultralytics ausente para ObjectDetector.") from exc
        self.model = YOLO(self.model_path, task="detect")

    def infer(self, frame) -> list[Detection]:
        if self.model is None:
            self.load()

        result = self.model.predict(frame, conf=self.min_conf, verbose=False)[0]
        detections: list[Detection] = []
        for box in result.boxes:
            cls = int(box.cls[0])
            if cls not in COCO_KEEP:
                continue
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            detections.append(
                Detection(
                    label=COCO_KEEP[cls],
                    confidence=float(box.conf[0]),
                    bbox=[x1, y1, x2, y2],
                    extra={"classId": cls},
                )
            )
        return detections
