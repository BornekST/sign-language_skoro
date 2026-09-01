from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://signlang:signlang123@localhost:5432/signlang"
    model_path: str = "./app/ml/saved_models"
    min_detection_confidence: float = 0.7
    min_tracking_confidence: float = 0.5
    max_num_hands: int = 2
    classification_stride: int = 1
    sequence_min_frames: int = 6
    sequence_max_frames: int = 40
    dtw_acceptance_distance: float = 0.35
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    admin_username: str = "admin"
    admin_password: str = "change-me"
    auth_secret: str = "change-me"
    auth_token_hours: int = 12

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
