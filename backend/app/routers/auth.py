import hmac
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.auth import create_admin_token, require_admin
from app.config import get_settings


router = APIRouter(prefix="/auth", tags=["auth"])
_failed_logins: dict[str, list[float]] = defaultdict(list)
LOGIN_WINDOW_SECONDS = 15 * 60
MAX_LOGIN_ATTEMPTS = 5


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest, request: Request):
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    attempts = [timestamp for timestamp in _failed_logins[client_ip] if now - timestamp < LOGIN_WINDOW_SECONDS]
    _failed_logins[client_ip] = attempts
    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Previše pokušaja. Pokušajte ponovno kasnije.")

    valid_user = hmac.compare_digest(payload.username, settings.admin_username)
    valid_password = hmac.compare_digest(payload.password, settings.admin_password)
    if not (valid_user and valid_password):
        attempts.append(now)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Pogrešno korisničko ime ili lozinka")
    _failed_logins.pop(client_ip, None)
    return {"access_token": create_admin_token(), "token_type": "bearer"}


@router.get("/me")
async def current_admin(username: str = Depends(require_admin)):
    return {"username": username, "role": "admin"}
