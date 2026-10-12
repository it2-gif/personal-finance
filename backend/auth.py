import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import get_db
from models import LoginSession, User

password_hasher = PasswordHash.recommended()

COOKIE_NAME = "finance_session"
SESSION_DURATION = timedelta(days=7)
COOKIE_SECURE = os.getenv("APP_ENV", "development") == "production"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("COOKIE_SAMESITE must be lax, strict, or none")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_recovery_code(code: str) -> str:
    return "".join(character for character in code.upper() if character.isalnum())


def hash_recovery_code(code: str) -> str:
    return hashlib.sha256(normalize_recovery_code(code).encode("utf-8")).hexdigest()


def create_recovery_code() -> str:
    value = secrets.token_hex(16).upper()
    return "-".join(value[index:index + 4] for index in range(0, len(value), 4))


def create_session(db: Session, user_id: int) -> str:
    token = secrets.token_urlsafe(32)

    db.add(
        LoginSession(
            token_hash=hash_token(token),
            user_id=user_id,
            expires_at=datetime.now(timezone.utc) + SESSION_DURATION,
        )
    )

    return token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(COOKIE_NAME)

    if not token or len(token) > 128:
        raise HTTPException(status_code=401, detail="Please log in")

    user = db.scalar(
        select(User)
        .join(LoginSession, LoginSession.user_id == User.id)
        .where(
            LoginSession.token_hash == hash_token(token),
            LoginSession.expires_at > datetime.now(timezone.utc),
        )
    )

    if user is None:
        raise HTTPException(status_code=401, detail="Please log in")

    return user
