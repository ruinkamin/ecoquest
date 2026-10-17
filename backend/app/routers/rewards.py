from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import services
from ..auth import current_user
from ..database import get_db
from ..models import PromoCode, Redemption, Reward, User, XpLedger
from ..schemas import RedemptionOut, RewardOut

router = APIRouter(prefix="/rewards", tags=["rewards"])


def _available():
    return (
        select(PromoCode.reward_id, func.count().label("n"))
        .where(PromoCode.status == "available")
        .group_by(PromoCode.reward_id)
        .subquery()
    )


def _is_valid(reward: Reward) -> bool:
    if not reward.is_active:
        return False
    if reward.valid_until is None:
        return True
    until = reward.valid_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return until > datetime.now(timezone.utc)


@router.get("", response_model=list[RewardOut])
async def list_rewards(db: AsyncSession = Depends(get_db)):
    avail = _available()
    rows = await db.execute(
        select(Reward, func.coalesce(avail.c.n, 0))
        .outerjoin(avail, avail.c.reward_id == Reward.id)
        .where(Reward.is_active.is_(True))
        .order_by(Reward.cost_xp)
    )
    return [
        RewardOut.model_validate(r).model_copy(update={"available": n})
        for r, n in rows.all() if _is_valid(r)
    ]


@router.get("/{reward_id}", response_model=RewardOut)
async def get_reward(reward_id: int, db: AsyncSession = Depends(get_db)):
    reward = await db.get(Reward, reward_id)
    if reward is None or not reward.is_active:
        raise HTTPException(404, "Награда не найдена")
    n = await db.scalar(
        select(func.count()).where(PromoCode.reward_id == reward_id, PromoCode.status == "available")
    )
    return RewardOut.model_validate(reward).model_copy(update={"available": n})


@router.post("/{reward_id}/redeem", response_model=RedemptionOut)
async def redeem(reward_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Одна транзакция: блокируем пользователя, проверяем баланс, резервируем код, списываем XP."""
    user_id = user.id  # после rollback объекты сессии expired, читать их нельзя
    # Первая операция — запись в строку пользователя: и Postgres, и SQLite держат эту блокировку до commit,
    # поэтому параллельные обмены одного человека идут по очереди и видят уже списанный баланс.
    # (SELECT ... FOR UPDATE SQLite молча игнорирует — так баланс уходил в минус.)
    await db.execute(update(User).where(User.id == user_id).values(name=User.name))
    reward = await db.get(Reward, reward_id)
    if reward is None or not _is_valid(reward):
        await db.rollback()
        raise HTTPException(404, "Награда недоступна")
    reward_out, cost = RewardOut.model_validate(reward), reward.cost_xp

    _, spendable = await services.xp_balance(db, user_id)
    if spendable < cost:
        await db.rollback()
        raise HTTPException(400, f"Недостаточно XP: есть {spendable}, нужно {cost}")

    # Код резервируем атомарным UPDATE ... WHERE status='available': если его параллельно забрал
    # другой пользователь, rowcount = 0 и берем следующий.
    for _ in range(5):
        code_id = await db.scalar(
            select(PromoCode.id).where(PromoCode.reward_id == reward_id, PromoCode.status == "available")
            .order_by(PromoCode.id).limit(1)
        )
        if code_id is None:
            await db.rollback()
            raise HTTPException(409, "Промокоды закончились")
        res = await db.execute(
            update(PromoCode).where(PromoCode.id == code_id, PromoCode.status == "available")
            .values(status="issued", issued_to=user_id, issued_at=datetime.now(timezone.utc))
        )
        if res.rowcount == 1:
            break
    else:
        await db.rollback()
        raise HTTPException(409, "Коды разбирают слишком быстро, попробуйте еще раз")

    code = await db.scalar(select(PromoCode.code).where(PromoCode.id == code_id))
    redemption = Redemption(user_id=user_id, reward_id=reward_id, promo_code_id=code_id, spent_xp=cost)
    db.add(redemption)
    await db.flush()
    db.add(XpLedger(user_id=user_id, delta=-cost, kind="redemption", redemption_id=redemption.id))
    await db.commit()
    await db.refresh(redemption)
    return RedemptionOut(id=redemption.id, reward=reward_out, code=code,
                         spent_xp=redemption.spent_xp, created_at=redemption.created_at)
