from .base import Detection, Detector
from .motion import MotionDetector


def build_detector(analysis_type: str) -> Detector:
    mode = (analysis_type or "motion").strip().lower()
    if mode == "motion":
        return MotionDetector()
    if mode == "face":
        from .face_detector import FaceDetector

        return FaceDetector()
    if mode == "general":
        from .object_detector import ObjectDetector

        return ObjectDetector()
    raise ValueError(f"analysis_type invalido: {analysis_type}")


__all__ = ["Detection", "Detector", "build_detector"]
