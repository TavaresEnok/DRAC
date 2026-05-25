"""Static AI runtime profiles.

These values are deliberately code-owned. The API selects a mode, but it
cannot override detector model, thresholds, sizing or overlay behavior.
"""

MOTION_PROFILE = {
    "mode": "motion",
    "detection_fps": 2.0,
    "analysis_width": 320,
    "analysis_height": 180,
    "motion_trigger": "SYSTEM",
    "motion_pixels_threshold": 1800,
    "motion_warmup_frames": 60,
    "event_debounce_seconds": 30,
    "show_after_hits": 1,
    "hide_after_misses": 2,
    "lost_ttl_ms": 600,
    "overlay_ttl_ms": 600,
}

FACE_PROFILE = {
    "mode": "face",
    "model": "scrfd_500m",
    "pack": "buffalo_s",
    "runtime": "onnxruntime_cpu",
    "analysis_width": 640,
    "analysis_height": 360,
    "detector_size": 640,
    "detection_fps": 2.0,
    "confidence": 0.35,
    "motion_trigger": "CAMERA",
    "event_debounce_seconds": 10,
    "show_after_hits": 1,
    "hide_after_misses": 2,
    "lost_ttl_ms": 600,
    "overlay_ttl_ms": 600,
    "recognition": False,
}

GENERAL_PROFILE = {
    "mode": "general",
    "model": "yolo26n",
    "runtime": "openvino_cpu",
    "precision": "int8",
    "analysis_width": 640,
    "analysis_height": 360,
    "imgsz": 512,
    "detection_fps": 2.0,
    "motion_trigger": "CAMERA",
    "event_debounce_seconds": 10,
    "classes": ("person",),
    "class_ids": (0,),
    "confidence_person": 0.22,
    "tracker": "bytetrack",
    "track_buffer": 12,
    "lost_ttl_ms": 1200,
    "hide_after_misses": 3,
    "show_after_hits": 1,
    "min_object_height_px": 18,
    "overlay_mode": "triangle",
    "overlay_ttl_ms": 1200,
    "persistent_track_id": True,
    "recognition": False,
    "face_detection": False,
    "detect_vehicles": False,
    "detect_animals": False,
    "detect_objects": False,
}


def runtime_profile(mode: str) -> dict:
    selected = (mode or "motion").strip().lower()
    if selected == "face":
        return FACE_PROFILE.copy()
    if selected == "general":
        return GENERAL_PROFILE.copy()
    return MOTION_PROFILE.copy()


def exposed_profiles() -> dict:
    return {
        "face": FACE_PROFILE.copy(),
        "general": {
            **GENERAL_PROFILE,
            "classes": list(GENERAL_PROFILE["classes"]),
            "class_ids": list(GENERAL_PROFILE["class_ids"]),
        },
    }
