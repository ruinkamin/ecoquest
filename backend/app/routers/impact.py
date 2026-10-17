"""«Доказ добра». Выполненный квест — доказательство: фото до/после, итоговый % (AI + организация),
команда и организации. /impact — Мапа змін Дніпра, /users/{id}/portfolio — публичное портфолио
волонтера. Оба доступны без входа; наружу отдаются только имя и аватар пользователей."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import (
    Organization, ParticipantStatus, Quest, QuestParticipant, QuestStatus, Submission, SubmissionStatus, User,
    XpLedger,
)
from ..schemas import ImpactOut, PortfolioItemOut, PortfolioOut, UserOut
from .stats import _user_stats

router = APIRouter(tags=["impact"])


def _completed():
    """Выполненные квесты с зачтенным отчетом (у completed-квеста он ровно один)."""
    return (
        select(Quest, Submission).join(Submission, Submission.quest_id == Quest.id)
        .where(Quest.status == QuestStatus.COMPLETED, Submission.status == SubmissionStatus.APPROVED)
    )


async def _impact(db: AsyncSession, rows) -> list[ImpactOut]:
    org_names: dict[int, Optional[str]] = {}

    async def org_name(org_id):
        if org_id is None:
            return None
        if org_id not in org_names:
            org = await db.get(Organization, org_id)
            org_names[org_id] = org.name if org else None
        return org_names[org_id]

    out = []
    for quest, sub in rows:
        team = (await db.scalars(
            select(User).join(QuestParticipant, QuestParticipant.user_id == User.id)
            .where(QuestParticipant.quest_id == quest.id, QuestParticipant.status == ParticipantStatus.CONFIRMED)
            .order_by(QuestParticipant.id)
        )).all()
        out.append(ImpactOut(
            quest_id=quest.id, title=quest.title, lat=quest.lat, lng=quest.lng, difficulty=quest.difficulty,
            photo_before_url=quest.photo_url, photo_after_url=sub.photo_url, final_percent=sub.final_percent or 0,
            completed_at=sub.decided_at, owner_org_name=await org_name(quest.owner_org_id),
            executor_org_name=await org_name(quest.organization_id),
            team=[UserOut.model_validate(u) for u in team],
        ))
    return out


@router.get("/impact", response_model=list[ImpactOut])
async def impact_map(
    bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat — видимая часть карты"),
    limit: int = Query(200, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Мапа змін: выполненные квесты с фото до/после для слайдера сравнения. Новые первыми."""
    q = _completed()
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = map(float, bbox.split(","))
        except ValueError:
            raise HTTPException(422, "bbox: minLng,minLat,maxLng,maxLat")
        q = q.where(Quest.lng.between(min_lng, max_lng), Quest.lat.between(min_lat, max_lat))
    rows = (await db.execute(q.order_by(Submission.decided_at.desc(), Submission.id.desc()).limit(limit))).all()
    return await _impact(db, rows)


@router.get("/users/{user_id}/portfolio", response_model=PortfolioOut)
async def portfolio(user_id: int, db: AsyncSession = Depends(get_db)):
    """Публичное портфолио волонтера по ссылке (для CV, LinkedIn, заявок): статистика и все квесты,
    где он был подтвержденным участником, с фото до/после и полученными XP."""
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    mine = select(QuestParticipant.quest_id).where(
        QuestParticipant.user_id == user_id, QuestParticipant.status == ParticipantStatus.CONFIRMED
    )
    rows = (await db.execute(
        _completed().where(Quest.id.in_(mine)).order_by(Submission.decided_at.desc(), Submission.id.desc())
    )).all()
    xp = dict((await db.execute(
        select(XpLedger.quest_id, XpLedger.delta)
        .where(XpLedger.user_id == user_id, XpLedger.kind == "quest_reward")
    )).all())
    items = [PortfolioItemOut(**i.model_dump(), awarded_xp=xp.get(i.quest_id, 0)) for i in await _impact(db, rows)]
    return PortfolioOut(stats=await _user_stats(db, user), items=items)
