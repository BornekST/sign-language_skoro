from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.sign import Sign, TrainingSample
from app.schemas.sign import SampleCreate, TrainingRequest
from app.ml.preprocessor import normalize_landmarks
from app.ml.trainer import train_model_async
from app.config import get_settings

import asyncio

router = APIRouter(prefix="/training", tags=["training"])
settings = get_settings()

# In-memory training state (single-process usage)
_training_state: dict = {"status": "idle", "progress": 0, "total": 0, "accuracy": None, "error": None}
_training_lock = asyncio.Lock()


@router.post("/samples")
async def add_sample(payload: SampleCreate, db: AsyncSession = Depends(get_db)):
    """Store a normalized landmark feature vector for a named sign."""
    if len(payload.features) != 126:
        raise HTTPException(status_code=422, detail="features must have exactly 126 values (21 landmarks × 3 coords × 2 hands)")

    # Upsert sign
    result = await db.execute(select(Sign).where(Sign.name == payload.sign_name))
    sign = result.scalar_one_or_none()
    if not sign:
        sign = Sign(name=payload.sign_name)
        db.add(sign)
        await db.flush()

    sample = TrainingSample(sign_id=sign.id, features=payload.features)
    db.add(sample)
    await db.commit()
    return {"ok": True, "sign": payload.sign_name}


@router.get("/samples/count")
async def sample_counts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Sign.name, Sign.id)
    )
    signs = result.all()
    counts = {}
    for name, sign_id in signs:
        count_res = await db.execute(
            select(TrainingSample).where(TrainingSample.sign_id == sign_id)
        )
        counts[name] = len(count_res.scalars().all())
    return counts


@router.delete("/samples/{sign_name}")
async def delete_samples(sign_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sign).where(Sign.name == sign_name))
    sign = result.scalar_one_or_none()
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    samples = await db.execute(select(TrainingSample).where(TrainingSample.sign_id == sign.id))
    for s in samples.scalars().all():
        await db.delete(s)
    await db.commit()
    return {"ok": True}


@router.post("/train")
async def start_training(payload: TrainingRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Trigger async model training from all stored samples."""
    async with _training_lock:
        if _training_state["status"] == "running":
            raise HTTPException(status_code=409, detail="Training already in progress")

    # Fetch all samples
    signs_result = await db.execute(select(Sign))
    signs = signs_result.scalars().all()

    samples = []
    for sign in signs:
        samp_result = await db.execute(
            select(TrainingSample).where(TrainingSample.sign_id == sign.id)
        )
        for s in samp_result.scalars().all():
            samples.append({"label": sign.name, "features": s.features})

    if len(samples) < 10:
        raise HTTPException(status_code=422, detail="Need at least 10 total samples to train")

    unique_labels = set(s["label"] for s in samples)
    if len(unique_labels) < 2:
        raise HTTPException(status_code=422, detail="Need samples for at least 2 different signs")

    _training_state.update({"status": "running", "progress": 0, "total": payload.epochs,
                             "accuracy": None, "error": None})

    recognizer = request.app.state.recognizer

    async def run():
        def progress_cb(epoch, total, acc):
            _training_state["progress"] = epoch
            _training_state["total"] = total

        result = await train_model_async(
            samples, settings.model_path, payload.epochs, progress_cb
        )
        if result["success"]:
            _training_state.update({"status": "done", "accuracy": result["accuracy"]})
            recognizer.reload()
        else:
            _training_state.update({"status": "error", "error": result.get("error")})

    asyncio.create_task(run())
    return {"started": True}


@router.get("/train/status")
async def training_status():
    return _training_state
