import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import config
from .database import get_db
from .models import Role, User

_google_request = google_requests.Request()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- пароли (scrypt из stdlib) ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        _, salt, digest = (stored or "").split("$")
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    except ValueError:
        return False
    return hmac.compare_digest(candidate.hex(), digest)


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Некорректный email")
    return email


def apply_moderator_role(user: User):
    if user.email and user.email in config.MODERATOR_EMAILS:
        user.role = Role.MODERATOR


# ---------- Google ----------

async def verify_google_token(token: str) -> dict:
    """Проверяет ID-token Google (из приложения на React Native), возвращает claims (sub, email, name, picture).
    Токен должен быть выписан на один из GOOGLE_CLIENT_ID (aud)."""
    if not config.GOOGLE_CLIENT_IDS:
        raise HTTPException(503, "GOOGLE_CLIENT_ID не настроен на сервере")
    try:
        return await run_in_threadpool(
            id_token.verify_oauth2_token, token, _google_request, config.GOOGLE_CLIENT_IDS
        )
    except ValueError as e:
        raise HTTPException(401, f"Невалидный Google токен: {e}")


async def upsert_google_user(db: AsyncSession, claims: dict) -> User:
    sub = claims["sub"]
    email = (claims.get("email") or "").lower() or None
    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is None and email and claims.get("email_verified"):
        # Уже регистрировался по email — привязываем Google к тому же аккаунту.
        user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(name=claims.get("name") or email or "Користувач", email=email)
        db.add(user)
    user.google_sub = sub
    user.avatar_url = claims.get("picture") or user.avatar_url
    apply_moderator_role(user)
    await db.commit()
    await db.refresh(user)
    return user


# ---------- сессия ----------

def issue_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=config.JWT_TTL_HOURS),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


async def current_user(
    authorization: str = Header(default=""), db: AsyncSession = Depends(get_db)
) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Нужен заголовок Authorization: Bearer <token>")
    try:
        user_id = int(jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Невалидный или просроченный токен")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(401, "Пользователь не найден")
    return user


async def optional_user(
    authorization: str = Header(default=""), db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Для публичных страниц (детали квеста, профили): без заголовка — гость (None).
    Если токен передан, но невалиден — 401, чтобы фронт понял, что сессия истекла."""
    if not authorization:
        return None
    return await current_user(authorization, db)


async def require_moderator(user: User = Depends(current_user)) -> User:
    if user.role != Role.MODERATOR:
        raise HTTPException(403, "Только для модераторов")
    return user
