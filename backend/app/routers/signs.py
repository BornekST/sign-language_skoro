from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.sign import Sign, TrainingSample
from app.schemas.sign import SignCreate, SignResponse
from app.auth import require_admin
from app.constants import SYSTEM_DELETE_ACTION

router = APIRouter(prefix="/signs", tags=["signs"])


@router.get("/", response_model=list[SignResponse])
async def list_signs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sign))
    signs = result.scalars().all()

    out = []
    for sign in signs:
        count_result = await db.execute(
            select(func.count()).where(TrainingSample.sign_id == sign.id)
        )
        count = count_result.scalar()
        out.append(
            SignResponse(
                id=sign.id,
                name=sign.name,
                description=sign.description,
                created_at=sign.created_at,
                sample_count=count or 0,
            )
        )
    return out


@router.post("/", response_model=SignResponse, status_code=201)
async def create_sign(payload: SignCreate, db: AsyncSession = Depends(get_db), _admin: str = Depends(require_admin)):
    existing = await db.execute(select(Sign).where(Sign.name == payload.name))
    if existing.scalar():
        raise HTTPException(status_code=409, detail="Sign already exists")

    sign = Sign(name=payload.name, description=payload.description)
    db.add(sign)
    await db.commit()
    await db.refresh(sign)
    return SignResponse(id=sign.id, name=sign.name, description=sign.description,
                        created_at=sign.created_at, sample_count=0)


@router.delete("/{sign_id}", status_code=204)
async def delete_sign(sign_id: int, db: AsyncSession = Depends(get_db), _admin: str = Depends(require_admin)):
    result = await db.execute(select(Sign).where(Sign.id == sign_id))
    sign = result.scalar_one_or_none()
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    if " ".join(sign.name.split()).upper() == SYSTEM_DELETE_ACTION:
        raise HTTPException(status_code=409, detail="Sistemska radnja BRISANJE ne može se obrisati")
    await db.delete(sign)
    await db.commit()
