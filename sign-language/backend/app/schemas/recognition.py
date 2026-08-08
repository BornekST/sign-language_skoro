from pydantic import BaseModel
from typing import Optional


class FrameMessage(BaseModel):
    frame: str  # base64-encoded JPEG


class RecognitionResult(BaseModel):
    hand_detected: bool
    sign: Optional[str]
    confidence: float
    landmarks: list[list[float]]
