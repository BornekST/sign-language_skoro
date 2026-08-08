from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.config import get_settings
from app.database import init_db
from app.routers import recognition, signs, training, tts
from app.ml.sign_recognizer import SignRecognizer

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    os.makedirs(settings.model_path, exist_ok=True)

    # Initialize the recognizer singleton
    app.state.recognizer = SignRecognizer(settings.model_path)

    yield

    # Shutdown
    pass


app = FastAPI(
    title="Sign Language Recognition API",
    description="Real-time sign language recognition using MediaPipe and TensorFlow",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recognition.router, prefix="/api")
app.include_router(signs.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(tts.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
