from dataclasses import dataclass
from typing import Optional

from app.constants import SYSTEM_DELETE_ACTION


@dataclass
class Candidate:
    sign: str
    frames: int


class PredictionStabilizer:
    """Turn frame predictions into stable, session-scoped text actions."""

    def __init__(
        self,
        confirm_frames: int = 2,
        tentative_max_frames: int = 6,
        min_confidence: float = 0.78,
        delete_confidence: float = 0.60,
    ):
        self.confirm_frames = confirm_frames
        self.tentative_max_frames = tentative_max_frames
        self.min_confidence = min_confidence
        self.delete_confidence = delete_confidence
        self.current: Optional[Candidate] = None
        self.accepted: Optional[Candidate] = None

    def process(self, sign: Optional[str], confidence: float) -> Optional[dict]:
        normalized = " ".join(sign.split()).upper() if sign else None
        required = self.delete_confidence if normalized == SYSTEM_DELETE_ACTION else self.min_confidence

        if not normalized or confidence < required:
            self.current = None
            self.accepted = None
            return None

        if self.accepted and self.accepted.sign == normalized:
            self.accepted.frames += 1
            return None

        if not self.current or self.current.sign != normalized:
            self.current = Candidate(normalized, 1)
            return None

        self.current.frames += 1
        previous = self.accepted
        can_correct = bool(
            previous
            and len(previous.sign) == 1
            and len(normalized) == 1
            and previous.frames <= self.tentative_max_frames
        )

        if can_correct and self.current.frames <= previous.frames:
            return None
        if not can_correct and self.current.frames < self.confirm_frames:
            return None

        if normalized == SYSTEM_DELETE_ACTION:
            action = {"type": "delete"}
        elif can_correct:
            action = {"type": "replace", "value": normalized}
        else:
            action = {"type": "add", "value": normalized}

        self.accepted = Candidate(normalized, self.current.frames)
        return action
