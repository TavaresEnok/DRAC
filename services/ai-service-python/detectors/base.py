from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: list[int]
    landmarks: Optional[list] = None
    event_type: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)


class Detector:
    event_type = "GENERIC"

    def load(self) -> None:
        raise NotImplementedError

    def close(self) -> None:
        return None

    def infer(self, frame) -> list[Detection]:
        raise NotImplementedError
