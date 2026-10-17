"""Статистика. /stats — публичная витрина платформы (видно без входа, чтобы новые пользователи видели,
что сайт живой). Статистика игрока и организации — часть профиля и геймификации; на правила не влияет."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import config, services
from ..auth import current_user
from ..database import get_db
from ..models import (
    Organization, OrganizationMember, OrgStatus, ParticipantStatus, Partner, Quest, QuestParticipant, QuestStatus,
    Redemption, Report, ReportStatus, Submission, SubmissionStatus, User, XpLedger,
)
from ..schemas import (
    OrgOut, OrgStatsOut, PlatformStatsOut, TrustOut, UserOut, UserStatsOut, WeekOut,
)

router = APIRouter(tags=["stats"])

WEEKS = 8


def _avg(value) -> Optional[float]:
    return round(float(value), 1) if value is not None else None


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _count(db: AsyncSession, model, *where) -> int:
    return int(await db.scalar(select(func.count()).select_from(model).where(*where)) or 0)


async def _weeks(db: AsyncSession) -> list[WeekOut]:
    now = datetime.now(timezone.utc)
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    starts = [monday - timedelta(weeks=i) for i in range(WEEKS - 1, -1, -1)]
    since = starts[0]
    cleaned = (await db.scalars(
        select(Submission.decided_at).where(Submission.status == SubmissionStatus.APPROVED,
                                            Submission.decided_at >= since)
    )).all()
    reports = (await db.scalars(select(Report.created_at).where(Report.created_at >= since))).all()

    def bucket(ts) -> int:
        return min(WEEKS - 1, (_utc(ts) - since).days // 7)

    out = [WeekOut(week_start=s, places_cleaned=0, reports=0) for s in starts]
    for ts in cleaned:
        if ts:
            out[bucket(ts)].places_cleaned += 1
    for ts in reports:
        if ts:
            out[bucket(ts)].reports += 1
    return out


@router.get("/stats", response_model=PlatformStatsOut)
async def platform_stats(db: AsyncSession = Depends(get_db)):
    """Без авторизации. Для главной и питча."""
    by_status = dict((await db.execute(select(Quest.status, func.count()).group_by(Quest.status))).all())
    reports_total = await _count(db, Report)
    reports_converted = await _count(db, Report, Report.status == ReportStatus.CONVERTED)
    volunteers = await db.scalar(select(func.count(func.distinct(XpLedger.user_id))).where(XpLedger.delta > 0))
    xp_awarded = await db.scalar(select(func.coalesce(func.sum(XpLedger.delta), 0)).where(XpLedger.delta > 0))
    avg_pct = await db.scalar(
        select(func.avg(Submission.final_percent)).where(Submission.status == SubmissionStatus.APPROVED)
    )
    agreed_flag = case((Submission.disputed.is_(False), 1), else_=0)
    decided, agreed = (await db.execute(
        select(func.count(), func.coalesce(func.sum(agreed_flag), 0)).where(Submission.org_percent.is_not(None))
    )).one()
    return PlatformStatsOut(
        places_cleaned=by_status.get(QuestStatus.COMPLETED, 0),
        quests_available=by_status.get(QuestStatus.AVAILABLE, 0),
        quests_in_progress=by_status.get(QuestStatus.IN_PROGRESS, 0) + by_status.get(QuestStatus.PENDING_VERIFICATION, 0),
        reports_total=reports_total,
        reports_converted=reports_converted,
        volunteers=int(volunteers or 0),
        organizations=await _count(db, Organization, Organization.status == OrgStatus.APPROVED),
        partners=await _count(db, Partner, Partner.status == OrgStatus.APPROVED),
        xp_awarded=int(xp_awarded or 0),
        promo_codes_issued=await _count(db, Redemption),
        avg_completion_percent=_avg(avg_pct),
        ai_agreement=round(int(agreed) / decided, 2) if decided else None,
        weeks=await _weeks(db),
    )


async def _user_stats(db: AsyncSession, user: User) -> UserStatsOut:
    lifetime, _ = await services.xp_balance(db, user.id)
    completed = await db.scalar(
        select(func.count()).select_from(QuestParticipant).join(Quest, Quest.id == QuestParticipant.quest_id)
        .where(QuestParticipant.user_id == user.id, QuestParticipant.status == ParticipantStatus.CONFIRMED,
               Quest.status == QuestStatus.COMPLETED)
    )
    by_status = dict((await db.execute(
        select(Submission.status, func.count()).where(Submission.user_id == user.id).group_by(Submission.status)
    )).all())
    approved, rejected = by_status.get(SubmissionStatus.APPROVED, 0), by_status.get(SubmissionStatus.REJECTED, 0)
    avg_pct = await db.scalar(
        select(func.avg(Submission.final_percent))
        .where(Submission.user_id == user.id, Submission.status == SubmissionStatus.APPROVED)
    )
    reports_converted = await _count(db, Report, Report.created_by == user.id, Report.status == ReportStatus.CONVERTED)
    return UserStatsOut(
        user=UserOut.model_validate(user),
        lifetime_xp=lifetime,
        level=services.level_for(lifetime),
        level_progress_xp=lifetime % config.XP_PER_LEVEL,
        xp_per_level=config.XP_PER_LEVEL,
        quests_completed=int(completed or 0),
        submissions_approved=approved,
        submissions_rejected=rejected,
        reliability=round(approved / (approved + rejected), 2) if approved + rejected else None,
        avg_completion_percent=_avg(avg_pct),
        reports_created=await _count(db, Report, Report.created_by == user.id),
        reports_converted=reports_converted,
        organizations=await _count(db, OrganizationMember, OrganizationMember.user_id == user.id),
    )


@router.get("/me/stats", response_model=UserStatsOut)
async def my_stats(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await _user_stats(db, user)


@router.get("/users/{user_id}/stats", response_model=UserStatsOut)
async def user_stats(user_id: int, db: AsyncSession = Depends(get_db)):
    """Публичный профиль игрока без входа (рейтинг, приглашение в команду)."""
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    return await _user_stats(db, user)


@router.get("/organizations/{org_id}/stats", response_model=OrgStatsOut)
async def org_stats(org_id: int, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    if org is None or org.status != OrgStatus.APPROVED:
        raise HTTPException(404, "Организация не найдена")
    avg_pct = await db.scalar(
        select(func.avg(Submission.final_percent)).join(Quest, Quest.id == Submission.quest_id)
        .where(Quest.owner_org_id == org_id, Submission.status == SubmissionStatus.APPROVED)
    )
    points = await services.org_points(db, org_id)
    return OrgStatsOut(
        organization=OrgOut.model_validate(org).model_copy(update={"points": points}),
        points=points,
        members=await _count(db, OrganizationMember, OrganizationMember.organization_id == org_id),
        quests_created=await _count(db, Quest, Quest.owner_org_id == org_id),
        quests_published=await _count(db, Quest, Quest.owner_org_id == org_id, Quest.status.in_(QuestStatus.PUBLIC)),
        quests_completed_owned=await _count(db, Quest, Quest.owner_org_id == org_id,
                                            Quest.status == QuestStatus.COMPLETED),
        quests_completed_as_executor=await _count(db, Quest, Quest.organization_id == org_id,
                                                  Quest.status == QuestStatus.COMPLETED),
        reports_converted=await _count(db, Report, Report.organization_id == org_id),
        avg_completion_percent=_avg(avg_pct),
        trust=TrustOut(**await services.org_trust(db, org_id)),
    )
