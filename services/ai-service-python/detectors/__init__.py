from .base import Detection, Detector
from .motion import MotionDetector


def build_detector(analysis_type: str, cfg: dict | None = None) -> Detector:
    mode = (analysis_type or "motion").strip().lower()
    if mode == "motion":
        return MotionDetector(cfg)
    if mode == "face":
        from .face_detector import FaceDetector

        return FaceDetector(cfg)
    if mode == "general":
        from .object_detector import ObjectDetector

        return ObjectDetector(cfg)
    if mode == "recognition":
        from .face_recognizer import RecognitionPipeline

        return RecognitionPipeline(cfg)
    raise ValueError(f"analysis_type invalido: {analysis_type}")


__all__ = ["Detection", "Detector", "build_detector"]
