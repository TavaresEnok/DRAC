import os

import cv2
import numpy as np

from .base import Detection, Detector


class MotionDetector(Detector):
    event_type = "MOTION_DETECTED"

    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}
        self.frame_width = max(160, int(os.getenv("AI_FRAME_WIDTH", "320")))
        self.frame_height = max(90, int(os.getenv("AI_FRAME_HEIGHT", "180")))
        self.motion_pixels_threshold = max(1, int(os.getenv("AI_MOTION_PIXELS_THRESHOLD", "1800")))
        self.fgbg = None

    def load(self) -> None:
        if self.fgbg is None:
            self.fgbg = cv2.createBackgroundSubtractorMOG2(
                history=500,
                varThreshold=50,
                detectShadows=True,
            )

    def infer(self, frame) -> list[Detection]:
        if self.fgbg is None:
            self.load()

        small_frame = cv2.resize(frame, (self.frame_width, self.frame_height))
        fgmask = self.fgbg.apply(small_frame)
        kernel = np.ones((5, 5), np.uint8)
        fgmask = cv2.morphologyEx(fgmask, cv2.MORPH_OPEN, kernel)
        motion_pixels = int(np.count_nonzero(fgmask))

        if motion_pixels <= self.motion_pixels_threshold:
            return []

        return [
            Detection(
                label="motion",
                confidence=min(1.0, motion_pixels / max(1, self.motion_pixels_threshold * 4)),
                bbox=[0, 0, int(frame.shape[1]), int(frame.shape[0])],
                extra={"value": motion_pixels, "motionPixels": motion_pixels},
            )
        ]
