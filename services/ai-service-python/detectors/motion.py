import cv2
import numpy as np

from .base import Detection, Detector
from runtime_profiles import MOTION_PROFILE


class MotionDetector(Detector):
    event_type = "MOTION_DETECTED"

    def __init__(self, cfg: dict | None = None):
        self.frame_width = int(MOTION_PROFILE["analysis_width"])
        self.frame_height = int(MOTION_PROFILE["analysis_height"])
        self.motion_pixels_threshold = int(MOTION_PROFILE["motion_pixels_threshold"])
        self.fgbg = None
        # Contador de frames para fase de aquecimento (warm-up)
        # Durante o warm-up o MOG2 aprende o fundo com taxa alta para eliminar fantasmas
        self._warmup_frames = 0
        self._warmup_total = int(MOTION_PROFILE["motion_warmup_frames"])
        # Confirmação: só dispara movimento se ele persistir por N frames de
        # análise SEGUIDOS. Mata falso positivo de 1 frame (ruído/flicker/
        # compressão). A 2 fps, 3 hits = ~1.5s de movimento real.
        self._consecutive_hits = 0
        self._min_consecutive = int(MOTION_PROFILE.get("motion_min_consecutive_hits", 3))

    def load(self) -> None:
        if self.fgbg is None:
            self.fgbg = cv2.createBackgroundSubtractorMOG2(
                history=300,        # Menos história = adapta mais rápido
                varThreshold=40,    # Mais sensível a diferenças reais
                detectShadows=False,  # Desabilita detecção de sombra (causa fantasmas cinzas)
            )
            self._warmup_frames = 0

    def infer(self, frame, context_key: str | None = None, **kwargs) -> list[Detection]:
        if self.fgbg is None:
            self.load()

        small_frame = cv2.resize(frame, (self.frame_width, self.frame_height))

        # Durante o warm-up: usa taxa de aprendizado alta (0.1) para queimar o fundo rapidamente
        # Após o warm-up: usa taxa automática (-1) para estabilidade
        if self._warmup_frames < self._warmup_total:
            learning_rate = 0.1  # Aprende fundo rapidissimamente nos primeiros frames
            self._warmup_frames += 1
        else:
            learning_rate = -1  # Modo automático estável

        fgmask = self.fgbg.apply(small_frame, learningRate=learning_rate)

        # Morfologia mais agressiva para eliminar ruído e fantasmas residuais
        kernel = np.ones((5, 5), np.uint8)
        fgmask = cv2.morphologyEx(fgmask, cv2.MORPH_OPEN, kernel)
        fgmask = cv2.morphologyEx(fgmask, cv2.MORPH_CLOSE, kernel)

        # Durante warm-up não reporta movimento (evita falsos positivos enquanto aprende)
        if self._warmup_frames < self._warmup_total:
            return []

        motion_pixels = int(np.count_nonzero(fgmask))

        if motion_pixels <= self.motion_pixels_threshold:
            self._consecutive_hits = 0  # quebrou a sequência → zera
            return []

        # Movimento neste frame; só confirma após N frames seguidos.
        self._consecutive_hits += 1
        if self._consecutive_hits < self._min_consecutive:
            return []

        return [
            Detection(
                label="motion",
                confidence=min(1.0, motion_pixels / max(1, self.motion_pixels_threshold * 4)),
                bbox=[0, 0, int(frame.shape[1]), int(frame.shape[0])],
                event_type=self.event_type,
                extra={"value": motion_pixels, "motionPixels": motion_pixels},
            )
        ]
