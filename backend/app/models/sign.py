from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Sign(Base):
    """A sign in the vocabulary (e.g. letter 'A', word 'Hello')."""

    __tablename__ = "signs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    samples = relationship("TrainingSample", back_populates="sign", cascade="all, delete-orphan")


class TrainingSample(Base):
    """A training example: a time sequence of normalized landmark features."""

    __tablename__ = "training_samples"

    id = Column(Integer, primary_key=True, index=True)
    sign_id = Column(Integer, ForeignKey("signs.id"), nullable=False)
    features = Column(JSON, nullable=False)  # list of frames; each frame has 126 floats
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sign = relationship("Sign", back_populates="samples")
