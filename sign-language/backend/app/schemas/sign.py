from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SignCreate(BaseModel):
    name: str
    description: Optional[str] = None


class SignResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    sample_count: int = 0

    class Config:
        from_attributes = True


class SampleCreate(BaseModel):
    sign_name: str
    features: list[float]  # 126 floats (21 landmarks × 3 coords × 2 hands)


class TrainingRequest(BaseModel):
    epochs: int = 50
