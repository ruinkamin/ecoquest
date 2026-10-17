from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import services
from ..auth import current_user
from ..database import get_db
from ..models import (
    Organization, OrganizationMember, OrgLedger, OrgStatus, ParticipantStatus, PromoCode, Quest, QuestParticipant, QuestStatus,
    Report,
    Redemption, Reward, User, XpLedger,
)
from ..schemas import LeaderOut, MeOut, OrgLeaderOut, OrgOut, QuestOut, RedemptionOut, ReportOut, RewardOut, UserOut

router = APIRouter(tags=["me"])


def _my_confirmed():
    return select(QuestParticipant.quest_id).where(
        QuestParticipant.status == ParticipantStatus.CONFIRMED
    )


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    lifetime, spendable = await services.xp_balance(db, user.id)
    created = await db.scalar(select(func.count()).where(Quest.created_by == user.id))
    completed = await db.scalar(
        select(func.count()).where(
            Quest.id.in_(_my_confirmed().where(QuestParticipant.user_id == user.id)),
            Quest.status == QuestStatus.COMPLETED,
        )
    )
    member_of = (await db.scalars(
        select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user.id)
    )).all()
    moderated = [o for o in member_of if await services.is_org_moderator(db, o, user.id)]
    return MeOut(
        **UserOut.model_validate(user).model_dump(), email=user.email, role=user.role,
        has_password=bool(user.password_hash),
        has_google=bool(user.google_sub and not user.google_sub.startswith("dev:")),
        lifetime_xp=lifetime, spendable_xp=spendable, level=services.level_for(lifetime),
        created_count=created, completed_count=completed, moderated_org_ids=moderated,
    )


@router.get("/me/quests", response_model=list[QuestOut])
async def my_quests(
    kind: Literal["created", "taken", "completed"] = "taken",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """created — мои заявки (в т.ч. pending_moderation/blocked); taken — где я ответственный или
    подтвержденный участник и квест не закрыт; completed — выполненные мной."""
    q = select(Quest)
    mine = Quest.id.in_(_my_confirmed().where(QuestParticipant.user_id == user.id))
    if kind == "created":
        q = q.where(Quest.created_by == user.id)
    elif kind == "taken":
        q = q.where(mine, Quest.status != QuestStatus.COMPLETED)
    else:
        q = q.where(mine, Quest.status == QuestStatus.COMPLETED)
    return (await db.scalars(q.order_by(Quest.created_at.desc()))).all()


@router.get("/me/reports", response_model=list[ReportOut])
async def my_reports(
    reviewer: Literal["all", "self", "ai"] = "all",
    status: Literal["all", "pending", "evaluated", "failed"] = "all",
    q: Optional[str] = Query(None, max_length=100),
    limit: int = Query(200, ge=1, le=500),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Report).where(Report.created_by == user.id)
    if reviewer != "all":
        query = query.where(Report.reviewer_type == reviewer)
    if status != "all":
        query = query.where(Report.review_status == status)
    if q and q.strip():
        query = query.where(Report.description.ilike(f"%{q.strip()}%"))
    return (await db.scalars(query.order_by(Report.created_at.desc()).limit(limit))).all()


@router.get("/me/redemptions", response_model=list[RedemptionOut])
async def my_redemptions(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.execute(
        select(Redemption, Reward, PromoCode)
        .join(Reward, Reward.id == Redemption.reward_id)
        .join(PromoCode, PromoCode.id == Redemption.promo_code_id)
        .where(Redemption.user_id == user.id)
        .order_by(Redemption.created_at.desc())
    )
    return [
        RedemptionOut(id=r.id, reward=RewardOut.model_validate(rw), code=pc.code,
                      spent_xp=r.spent_xp, created_at=r.created_at)
        for r, rw, pc in rows.all()
    ]


@router.get("/users/search", response_model=list[UserOut])
async def search_users(q: str = Query(..., min_length=2), _: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    """Поиск для приглашения в команду / организацию: точный email или часть имени."""
    q = q.strip()
    if not q:
        raise HTTPException(422, "Пустой запрос")
    rows = await db.scalars(
        select(User).where(or_(User.email == q.lower(), User.name.ilike(f"%{q}%"))).order_by(User.name).limit(10)
    )
    return rows.all()


@router.get("/leaderboard", response_model=list[LeaderOut])
async def leaderboard(limit: int = 20, db: AsyncSession = Depends(get_db)):
    earned = func.sum(XpLedger.delta).label("earned")
    rows = await db.execute(
        select(User, earned)
        .join(XpLedger, XpLedger.user_id == User.id)
        .where(XpLedger.delta > 0)
        .group_by(User.id)
        .order_by(earned.desc())
        .limit(min(limit, 100))
    )
    return [
        LeaderOut(user=UserOut.model_validate(u), lifetime_xp=int(xp), level=services.level_for(int(xp)))
        for u, xp in rows.all()
    ]


@router.get("/leaderboard/organizations", response_model=list[OrgLeaderOut])
async def org_leaderboard(limit: int = 20, db: AsyncSession = Depends(get_db)):
    points = func.sum(OrgLedger.delta).label("points")
    rows = await db.execute(
        select(Organization, points)
        .join(OrgLedger, OrgLedger.organization_id == Organization.id)
        .where(Organization.status == OrgStatus.APPROVED)
        .group_by(Organization.id)
        .order_by(points.desc())
        .limit(min(limit, 100))
    )
    return [
        OrgLeaderOut(organization=OrgOut.model_validate(o).model_copy(update={"points": int(p)}), points=int(p))
        for o, p in rows.all()
    ]
