import base64
import hashlib
import hmac
import json
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings


bearer = HTTPBearer(auto_error=False)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_admin_token() -> str:
    settings = get_settings()
    payload = _encode(json.dumps({
        "sub": settings.admin_username,
        "role": "admin",
        "exp": int(time.time()) + settings.auth_token_hours * 3600,
    }, separators=(",", ":")).encode())
    signature = hmac.new(settings.auth_secret.encode(), payload.encode(), hashlib.sha256).digest()
    return f"{payload}.{_encode(signature)}"


def verify_admin_token(token: str) -> str:
    settings = get_settings()
    try:
        payload, signature = token.split(".", 1)
        expected = hmac.new(settings.auth_secret.encode(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_decode(signature), expected):
            raise ValueError
        claims = json.loads(_decode(payload))
        if claims.get("role") != "admin" or claims.get("sub") != settings.admin_username:
            raise ValueError
        if int(claims.get("exp", 0)) <= int(time.time()):
            raise ValueError
        return claims["sub"]
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Administrator login required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_admin_token(credentials.credentials)
