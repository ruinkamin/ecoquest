import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import config, mailer
from ..auth import (
    apply_moderator_role, hash_password, issue_token, normalize_email,
    upsert_google_user, verify_google_token, verify_password,
)
from ..database import get_db
from ..models import PasswordReset, User
from ..schemas import (
    DevLoginIn, ForgotPasswordIn, GoogleLoginIn, LoginIn, RegisterIn, ResetPasswordIn, TokenOut, UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token(user: User) -> TokenOut:
    return TokenOut(access_token=issue_token(user), user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    email = normalize_email(body.email)
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Этот email уже зарегистрирован")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    apply_moderator_role(user)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _token(user)


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    return _token(user)


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordIn, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Всегда отвечает одинаково, чтобы не раскрывать, есть ли аккаунт. Письмо уходит в фоне
    (поэтому и по времени ответа не понять). При DEV_LOGIN токен дополнительно приходит в dev_token."""
    answer = {"ok": True}
    user = await db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None:
        return answer
    token = secrets.token_urlsafe(32)
    db.add(PasswordReset(
        user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=config.RESET_TOKEN_MINUTES),
    ))
    await db.commit()
    background.add_task(mailer.send_password_reset, user.email, user.name, token)
    if config.DEV_LOGIN:
        answer["dev_token"] = token
    return answer


@router.post("/reset-password", response_model=TokenOut)
async def reset_password(body: ResetPasswordIn, db: AsyncSession = Depends(get_db)):
    """Одноразовый токен: после использования или по истечении срока не работает."""
    now = datetime.now(timezone.utc)
    reset = await db.scalar(
        select(PasswordReset).where(PasswordReset.token_hash == hashlib.sha256(body.token.encode()).hexdigest())
    )
    expires = reset.expires_at if reset else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if reset is None or reset.used_at is not None or expires < now:
        raise HTTPException(400, "Ссылка для сброса недействительна или устарела")
    res = await db.execute(
        update(PasswordReset).where(PasswordReset.id == reset.id, PasswordReset.used_at.is_(None)).values(used_at=now)
    )
    if res.rowcount != 1:
        await db.rollback()
        raise HTTPException(400, "Ссылка для сброса уже использована")
    user = await db.get(User, reset.user_id)
    user.password_hash = hash_password(body.password)
    await db.commit()
    await db.refresh(user)
    return _token(user)


@router.post("/google", response_model=TokenOut)
async def login_google(body: GoogleLoginIn, db: AsyncSession = Depends(get_db)):
    """Фронт получает credential (ID token) от Google Identity Services и шлет сюда."""
    return _token(await upsert_google_user(db, await verify_google_token(body.id_token)))


@router.post("/dev", response_model=TokenOut)
async def login_dev(body: DevLoginIn, db: AsyncSession = Depends(get_db)):
    """Вход по имени без пароля (демо-аккаунты из seed). Работает только при DEV_LOGIN=true."""
    if not config.DEV_LOGIN:
        raise HTTPException(404)
    name = body.name.strip()[:64]
    if not name:
        raise HTTPException(422, "Пустое имя")
    sub = f"dev:{name.lower()}"
    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = User(google_sub=sub, name=name)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return _token(user)
