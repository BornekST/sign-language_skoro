from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.sign import Sign, TrainingSample
from app.schemas.sign import SampleCreate, TrainingRequest
from app.config import get_settings

import asyncio
import json
import os

router = APIRouter(prefix="/training", tags=["training"])
settings = get_settings()

# In-memory training state (single-process usage)
_training_state: dict = {"status": "idle", "progress": 0, "total": 0, "accuracy": None, "error": None}
_training_lock = asyncio.Lock()


@router.post("/samples")
async def add_sample(payload: SampleCreate, db: AsyncSession = Depends(get_db)):
    """Store one complete normalized landmark sequence for a named sign."""
    features = payload.features
    if not features:
        raise HTTPException(status_code=422, detail="sequence must not be empty")
    # Backwards compatibility: turn an old single-frame sample into a sequence.
    if isinstance(features[0], (int, float)):
        features = [features]
    if len(features) < settings.sequence_min_frames:
        raise HTTPException(status_code=422, detail=f"sequence needs at least {settings.sequence_min_frames} frames")
    if len(features) > settings.sequence_max_frames:
        raise HTTPException(status_code=422, detail=f"sequence may have at most {settings.sequence_max_frames} frames")
    if any(len(frame) != 126 for frame in features):
        raise HTTPException(status_code=422, detail="every frame must have exactly 126 values")

    # Upsert sign
    result = await db.execute(select(Sign).where(Sign.name == payload.sign_name))
    sign = result.scalar_one_or_none()
    if not sign:
        sign = Sign(name=payload.sign_name)
        db.add(sign)
        await db.flush()

    sample = TrainingSample(sign_id=sign.id, features=features)
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
        counts[name] = sum(
            1 for sample in count_res.scalars().all()
            if sample.features and isinstance(sample.features[0], list)
        )
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
    """Build the DTW reference library from all stored sequence samples."""
    async with _training_lock:
        if _training_state["status"] == "running":
            raise HTTPException(status_code=409, detail="Training already in progress")

    # Fetch all samples
    signs_result = await db.execute(select(Sign))
    signs = signs_result.scalars().all()

    sequences: dict[str, list[list[list[float]]]] = {}
    for sign in signs:
        samp_result = await db.execute(
            select(TrainingSample).where(TrainingSample.sign_id == sign.id)
        )
        valid = []
        for s in samp_result.scalars().all():
            value = s.features
            if value and isinstance(value[0], list) and len(value) >= settings.sequence_min_frames:
                valid.append(value)
        if valid:
            sequences[sign.name] = valid

    if len(sequences) < 2:
        raise HTTPException(status_code=422, detail="Potrebne su sekvence za najmanje 2 različita znaka")

    _training_state.update({"status": "running", "progress": 0, "total": 1,
                             "accuracy": None, "error": None})

    recognizer = request.app.state.recognizer

    async def run():
        try:
            os.makedirs(settings.model_path, exist_ok=True)
            path = os.path.join(settings.model_path, "sign_sequences.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(sequences, f)
            _training_state.update({"status": "done", "progress": 1, "accuracy": None})
            recognizer.reload()
        except Exception as exc:
            _training_state.update({"status": "error", "error": str(exc)})

    asyncio.create_task(run())
    return {"started": True}


@router.get("/train/status")
async def training_status():
    return _training_state
