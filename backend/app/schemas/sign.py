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
    # One complete performance of a sign: N frames × 126 normalized values.
    # A flat vector is still accepted so old clients/data remain compatible.
    features: list[float] | list[list[float]]


class TrainingRequest(BaseModel):
    epochs: int = 50
