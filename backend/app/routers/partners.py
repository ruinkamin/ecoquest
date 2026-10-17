"""Партнеры магазина. Создаются по заявке (одобряет модератор приложения). Глава одобренного партнера
сам заводит награды и загружает промокоды; отдельного одобрения наград нет."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, optional_user
from ..database import get_db
from ..models import OrgStatus, Partner, PromoCode, Redemption, Reward, Role, User
from ..schemas import (
    CodesIn, PartnerCreateIn, PartnerOut, PartnerRewardStatsOut, PartnerStatsOut, RewardEditIn, RewardIn, RewardOut,
)

router = APIRouter(tags=["partners"])


async def _head_partner(db: AsyncSession, partner_id: int, user: User) -> Partner:
    partner = await db.get(Partner, partner_id)
    if partner is None:
        raise HTTPException(404, "Партнер не найден")
    if partner.head_id != user.id:
        raise HTTPException(403, "Только для главного аккаунта партнера")
    if partner.status != OrgStatus.APPROVED:
        raise HTTPException(409, "Партнер еще не одобрен")
    return partner


async def _own_reward(db: AsyncSession, partner: Partner, reward_id: int) -> Reward:
    reward = await db.get(Reward, reward_id)
    if reward is None or reward.partner_id != partner.id:
        raise HTTPException(404, "Награда не найдена")
    return reward


async def _reward_out(db: AsyncSession, reward: Reward) -> RewardOut:
    n = await db.scalar(
        select(func.count()).where(PromoCode.reward_id == reward.id, PromoCode.status == "available")
    )
    return RewardOut.model_validate(reward).model_copy(update={"available": n})


@router.post("/partners", response_model=PartnerOut, status_code=201)
async def apply_for_partner(body: PartnerCreateIn, user: User = Depends(current_user),
                            db: AsyncSession = Depends(get_db)):
    """Заявка на партнерство. Подавший — главный аккаунт партнера."""
    pending = await db.scalar(
        select(Partner.id).where(Partner.head_id == user.id, Partner.status == OrgStatus.PENDING)
    )
    if pending:
        raise HTTPException(409, "У вас уже есть заявка на рассмотрении")
    partner = Partner(name=body.name.strip(), description=body.description, logo_url=body.logo_url,
                      head_id=user.id)
    db.add(partner)
    await db.commit()
    await db.refresh(partner)
    return partner


@router.get("/partners", response_model=list[PartnerOut])
async def list_partners(db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Partner).where(Partner.status == OrgStatus.APPROVED))).all()


@router.get("/me/partners", response_model=list[PartnerOut])
async def my_partners(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Мои партнеры, включая заявки (для показа статуса)."""
    return (await db.scalars(select(Partner).where(Partner.head_id == user.id))).all()


@router.get("/partners/{partner_id}", response_model=PartnerOut)
async def get_partner(partner_id: int, user: Optional[User] = Depends(optional_user),
                      db: AsyncSession = Depends(get_db)):
    """Доступно без входа (одобренные партнеры); свою заявку видит глава, любую — модератор."""
    partner = await db.get(Partner, partner_id)
    if partner is None or (
        partner.status != OrgStatus.APPROVED and not (user and (partner.head_id == user.id or user.role == Role.MODERATOR))
    ):
        raise HTTPException(404, "Партнер не найден")
    return partner


@router.get("/partners/{partner_id}/stats", response_model=PartnerStatsOut)
async def partner_stats(partner_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Отдача для спонсора: коды по наградам, сколько выдано, сколько разных людей пришло, сколько XP
    потрачено. Видит глава партнера и модератор приложения."""
    partner = await db.get(Partner, partner_id)
    if partner is None or (partner.head_id != user.id and user.role != Role.MODERATOR):
        raise HTTPException(404, "Партнер не найден")
    issued_flag = case((PromoCode.status == "issued", 1), else_=0)
    rows = (await db.execute(
        select(Reward, func.count(PromoCode.id), func.coalesce(func.sum(issued_flag), 0))
        .outerjoin(PromoCode, PromoCode.reward_id == Reward.id)
        .where(Reward.partner_id == partner_id).group_by(Reward.id).order_by(Reward.id)
    )).all()
    rewards = [
        PartnerRewardStatsOut(reward_id=r.id, title=r.title, cost_xp=r.cost_xp, is_active=r.is_active,
                              codes_total=int(total), codes_issued=int(issued), codes_available=int(total) - int(issued))
        for r, total, issued in rows
    ]
    mine = select(Reward.id).where(Reward.partner_id == partner_id)
    users, xp = (await db.execute(
        select(func.count(func.distinct(Redemption.user_id)), func.coalesce(func.sum(Redemption.spent_xp), 0))
        .where(Redemption.reward_id.in_(mine))
    )).one()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent = await db.scalar(
        select(func.count()).select_from(Redemption)
        .where(Redemption.reward_id.in_(mine), Redemption.created_at >= week_ago)
    )
    return PartnerStatsOut(
        partner=PartnerOut.model_validate(partner),
        rewards_active=sum(r.is_active for r in rewards),
        codes_total=sum(r.codes_total for r in rewards),
        codes_issued=sum(r.codes_issued for r in rewards),
        codes_available=sum(r.codes_available for r in rewards),
        unique_users=int(users or 0),
        xp_spent=int(xp or 0),
        issued_last_7_days=int(recent or 0),
        rewards=rewards,
    )


@router.get("/partners/{partner_id}/rewards", response_model=list[RewardOut])
async def partner_rewards(partner_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Все награды партнера, включая выключенные, с остатком кодов. Только для главы."""
    partner = await _head_partner(db, partner_id, user)
    rows = (await db.scalars(select(Reward).where(Reward.partner_id == partner.id).order_by(Reward.id))).all()
    return [await _reward_out(db, r) for r in rows]


@router.post("/partners/{partner_id}/rewards", response_model=RewardOut, status_code=201)
async def create_reward(partner_id: int, body: RewardIn, user: User = Depends(current_user),
                        db: AsyncSession = Depends(get_db)):
    """Новая награда. Появится в магазине, когда загружены промокоды."""
    partner = await _head_partner(db, partner_id, user)
    reward = Reward(partner_id=partner.id, partner_name=partner.name, **body.model_dump())
    db.add(reward)
    await db.commit()
    await db.refresh(reward)
    return await _reward_out(db, reward)


@router.patch("/partners/{partner_id}/rewards/{reward_id}", response_model=RewardOut)
async def edit_reward(partner_id: int, reward_id: int, body: RewardEditIn, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    """Правка или снятие с витрины (is_active=false). Уже выданные коды остаются у пользователей."""
    reward = await _own_reward(db, await _head_partner(db, partner_id, user), reward_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(reward, field, value)
    await db.commit()
    await db.refresh(reward)
    return await _reward_out(db, reward)


@router.post("/partners/{partner_id}/rewards/{reward_id}/codes", response_model=RewardOut)
async def add_codes(partner_id: int, reward_id: int, body: CodesIn, user: User = Depends(current_user),
                    db: AsyncSession = Depends(get_db)):
    """Загрузить промокоды (каждый выдается один раз). Дубликаты — 409, ничего не сохраняется."""
    reward = await _own_reward(db, await _head_partner(db, partner_id, user), reward_id)
    codes = {c.strip() for c in body.codes if c.strip()}
    if not codes:
        raise HTTPException(422, "Пустой список кодов")
    db.add_all(PromoCode(reward_id=reward.id, code=c) for c in codes)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(409, "Некоторые коды уже загружены")
    reward = await db.get(Reward, reward_id)
    return await _reward_out(db, reward)
