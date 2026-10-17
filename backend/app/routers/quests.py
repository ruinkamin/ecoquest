import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import services, storage
from ..auth import current_user, normalize_email, optional_user
from ..database import get_db
from ..models import (
    ClaimMode, Organization, OrganizationMember, OrgStatus, ParticipantStatus, Quest, QuestParticipant,
    QuestStatus, Role, Submission, SubmissionStatus, User,
)
from ..schemas import (
    ClaimIn, InvitationOut, InviteIn, ParticipantOut, QuestActions, QuestDetailOut, QuestOut, RespondIn,
    SubmissionOut, UserOut,
)

router = APIRouter(tags=["quests"])


def ai_reason(ai_result: Optional[dict]) -> Optional[str]:
    if not ai_result:
        return None
    return ai_result.get("reason") or ai_result.get("error")


def submission_out(s: Submission) -> SubmissionOut:
    return SubmissionOut.model_validate(s)


async def require_org_moderator(db: AsyncSession, org_id: int, user: User):
    if not await services.is_org_moderator(db, org_id, user.id):
        raise HTTPException(403, "Только для модераторов одобренной организации")


async def create_quest_record(db: AsyncSession, background: BackgroundTasks, *, user_id: int, org_id: int,
                              photo_url: str, lat: float, lng: float, description=None, title=None,
                              report_id=None) -> Quest:
    """Квест в статусе ai_processing + фоновая AI-оценка. Права проверяет вызывающий."""
    quest = Quest(created_by=user_id, owner_org_id=org_id, lat=lat, lng=lng, photo_url=photo_url,
                  description=description or None, title=title or None, report_id=report_id)
    db.add(quest)
    await db.commit()
    await db.refresh(quest)
    background.add_task(services.run_quest_check, quest.id)
    return quest


async def _participants(db: AsyncSession, quest_id: int) -> list[tuple[QuestParticipant, User]]:
    rows = await db.execute(
        select(QuestParticipant, User).join(User, User.id == QuestParticipant.user_id)
        .where(QuestParticipant.quest_id == quest_id).order_by(QuestParticipant.id)
    )
    return list(rows.all())


async def _lead_quest(db: AsyncSession, quest_id: int, user: User) -> Quest:
    """Квест, где я ответственный за командное/орг выполнение и состав еще не зафиксирован."""
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(404, "Квест не найден")
    if quest.executor_id != user.id:
        raise HTTPException(403, "Только для ответственного")
    if quest.mode == ClaimMode.SOLO:
        raise HTTPException(409, "Квест взят самостоятельно — команды нет")
    if quest.status != QuestStatus.IN_PROGRESS:
        raise HTTPException(409, "Состав зафиксирован: отчет уже отправлен или квест закрыт")
    return quest


# ---------- карта и создание ----------

def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Расстояние по прямой (гаверсинус)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


@router.get("/quests", response_model=list[QuestOut])
async def list_quests(
    bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat — видимая часть карты"),
    status: Optional[str] = Query(None, description="через запятую; по умолчанию публичные статусы"),
    difficulty: Optional[str] = Query(None, description="через запятую, например 1,2,3"),
    q: Optional[str] = Query(None, max_length=100, description="поиск в названии и описании"),
    organization_id: Optional[int] = Query(None, description="квесты этой организации (owner)"),
    near: Optional[str] = Query(None, description="lat,lng — «рядом со мной»: сортировка по расстоянию"),
    radius_km: float = Query(3, gt=0, le=50, description="радиус для near"),
    limit: int = Query(200, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Карта и стрічка. Все фильтры необязательны и сочетаются. С near в ответе есть distance_km,
    квесты дальше radius_km отбрасываются, ближние первыми."""
    statuses = [s for s in status.split(",") if s in QuestStatus.PUBLIC] if status else list(QuestStatus.PUBLIC)
    query = select(Quest).where(Quest.status.in_(statuses))
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = map(float, bbox.split(","))
        except ValueError:
            raise HTTPException(422, "bbox: minLng,minLat,maxLng,maxLat")
        query = query.where(Quest.lng.between(min_lng, max_lng), Quest.lat.between(min_lat, max_lat))
    if difficulty:
        try:
            levels = [int(x) for x in difficulty.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(422, "difficulty: числа 1–5 через запятую")
        query = query.where(Quest.difficulty.in_(levels))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Quest.title.ilike(pattern), Quest.description.ilike(pattern)))
    if organization_id is not None:
        query = query.where(Quest.owner_org_id == organization_id)
    if not near:
        return (await db.scalars(query.order_by(Quest.created_at.desc()).limit(limit))).all()

    try:
        lat, lng = map(float, near.split(","))
    except ValueError:
        raise HTTPException(422, "near: lat,lng")
    # Грубый квадрат в БД, точное расстояние — в Python.
    dlat = radius_km / 111
    dlng = radius_km / (111 * max(0.1, math.cos(math.radians(lat))))
    query = query.where(Quest.lat.between(lat - dlat, lat + dlat), Quest.lng.between(lng - dlng, lng + dlng))
    found = []
    for quest in (await db.scalars(query)).all():
        dist = _distance_km(lat, lng, quest.lat, quest.lng)
        if dist <= radius_km:
            found.append(QuestOut.model_validate(quest).model_copy(update={"distance_km": round(dist, 2)}))
    return sorted(found, key=lambda x: x.distance_km)[:limit]


@router.post("/quests", response_model=QuestOut, status_code=201)
async def create_quest(
    background: BackgroundTasks,
    photo: UploadFile = File(...),
    lat: float = Form(..., ge=-90, le=90),
    lng: float = Form(..., ge=-180, le=180),
    organization_id: int = Form(..., description="организация-владелец; я ее модератор"),
    description: Optional[str] = Form(None, max_length=1000),
    title: Optional[str] = Form(None, max_length=120),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """multipart/form-data. Создает только модератор организации (житель ставит метку: POST /reports).
    Статусы: ai_processing -> pending_moderation -> available | blocked. Фронт опрашивает GET /quests/{id}."""
    await require_org_moderator(db, organization_id, user)
    photo_url = await storage.save_photo(photo)
    return await create_quest_record(db, background, user_id=user.id, org_id=organization_id, photo_url=photo_url,
                                     lat=lat, lng=lng, description=description, title=title)


@router.get("/quests/{quest_id}", response_model=QuestDetailOut)
async def get_quest(quest_id: int, user: Optional[User] = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    """Доступно без входа (гость видит опубликованные квесты; can_claim для гостя — повод показать вход)."""
    uid = user.id if user else None
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(404, "Квест не найден")
    # Неопубликованные (на проверке / заблокированные) видят только модераторы организации и приложения.
    is_owner_mod = uid is not None and await services.is_org_moderator(db, quest.owner_org_id, uid)
    if quest.status not in QuestStatus.PUBLIC and not (
        is_owner_mod or (uid is not None and (quest.created_by == uid or user.role == Role.MODERATOR))
    ):
        raise HTTPException(404, "Квест не найден")
    author = await db.get(User, quest.created_by)
    executor = await db.get(User, quest.executor_id) if quest.executor_id else None
    owner = await db.get(Organization, quest.owner_org_id)
    org = await db.get(Organization, quest.organization_id) if quest.organization_id else None
    participants = await _participants(db, quest.id)
    mine = next((p.status for p, u in participants if u.id == uid), None) if uid else None
    is_lead = uid is not None and quest.executor_id == uid
    last = None
    if mine is not None:
        last = await db.scalar(
            select(Submission).where(Submission.quest_id == quest.id).order_by(Submission.id.desc()).limit(1)
        )
    in_progress = quest.status == QuestStatus.IN_PROGRESS
    return QuestDetailOut(
        **QuestOut.model_validate(quest).model_dump(),
        ai_reason=ai_reason(quest.ai_result) if is_owner_mod else None,
        moderator_note=quest.moderator_note,
        author=UserOut.model_validate(author) if author else None,
        executor=UserOut.model_validate(executor) if executor else None,
        owner_org_name=owner.name if owner else None,
        organization_name=org.name if org else None,
        participants=[ParticipantOut(user=UserOut.model_validate(u), status=p.status) for p, u in participants],
        my_participation=mine,
        last_submission=submission_out(last) if last else None,
        actions=QuestActions(
            can_claim=quest.status == QuestStatus.AVAILABLE and quest.created_by != uid,
            can_invite=in_progress and is_lead and quest.mode != ClaimMode.SOLO,
            can_respond=in_progress and mine == ParticipantStatus.INVITED,
            can_submit=in_progress and is_lead,
            can_abandon=in_progress and is_lead,
        ),
    )


# ---------- взять квест и команда ----------

@router.post("/quests/{quest_id}/claim", response_model=QuestOut)
async def claim_quest(
    quest_id: int,
    body: Optional[ClaimIn] = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Тело необязательно (по умолчанию solo). Я становлюсь ответственным.
    team / organization — потом приглашаю участников через POST /quests/{id}/participants.
    organization — нужно быть участником одобренной организации; ей пойдут орг-очки."""
    body = body or ClaimIn()
    user_id = user.id  # после rollback объекты сессии expired, читать их нельзя
    org_id = None
    if body.mode == ClaimMode.ORGANIZATION:
        if body.organization_id is None:
            raise HTTPException(422, "Для mode=organization нужен organization_id")
        org = await db.get(Organization, body.organization_id)
        is_member = await db.scalar(
            select(OrganizationMember.id).where(
                OrganizationMember.organization_id == body.organization_id, OrganizationMember.user_id == user.id
            )
        )
        if org is None or org.status != OrgStatus.APPROVED or not is_member:
            raise HTTPException(403, "Вы не участник этой организации")
        org_id = org.id

    res = await db.execute(
        update(Quest)
        .where(Quest.id == quest_id, Quest.status == QuestStatus.AVAILABLE, Quest.created_by != user.id)
        .values(status=QuestStatus.IN_PROGRESS, executor_id=user.id, mode=body.mode, organization_id=org_id,
                claimed_at=datetime.now(timezone.utc))
    )
    if res.rowcount != 1:
        await db.rollback()
        quest = await db.get(Quest, quest_id)
        if quest is None:
            raise HTTPException(404, "Квест не найден")
        if quest.created_by == user_id:
            raise HTTPException(403, "Нельзя взять свой квест")
        raise HTTPException(409, "Квест уже взят или недоступен")
    db.add(QuestParticipant(quest_id=quest_id, user_id=user.id, status=ParticipantStatus.CONFIRMED))
    await db.commit()
    quest = await db.get(Quest, quest_id)
    await db.refresh(quest)
    return quest


@router.post("/quests/{quest_id}/abandon", response_model=QuestOut)
async def abandon_quest(quest_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Ответственный отказывается от квеста, пока отчет не отправлен (если отчет отклонен — тоже можно).
    Квест снова available, команда и приглашения снимаются; XP никто не получает."""
    res = await db.execute(
        update(Quest)
        .where(Quest.id == quest_id, Quest.status == QuestStatus.IN_PROGRESS, Quest.executor_id == user.id)
        .values(status=QuestStatus.AVAILABLE, executor_id=None, mode=None, organization_id=None, claimed_at=None)
    )
    if res.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Отказаться может только ответственный, пока отчет не отправлен")
    await db.execute(delete(QuestParticipant).where(QuestParticipant.quest_id == quest_id))
    await db.commit()
    quest = await db.get(Quest, quest_id)
    await db.refresh(quest)
    return quest


@router.post("/quests/{quest_id}/participants", response_model=ParticipantOut, status_code=201)
async def invite(quest_id: int, body: InviteIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Ответственный приглашает зарегистрированного пользователя (по email или id, см. GET /users/search)."""
    quest = await _lead_quest(db, quest_id, user)
    if body.email:
        target = await db.scalar(select(User).where(User.email == normalize_email(body.email)))
    elif body.user_id:
        target = await db.get(User, body.user_id)
    else:
        raise HTTPException(422, "Нужен email или user_id")
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    if target.id == quest.created_by:
        # Иначе автор получил бы XP за собственный квест через чужую команду.
        raise HTTPException(403, "Автор квеста не может участвовать в его выполнении")
    db.add(QuestParticipant(quest_id=quest_id, user_id=target.id, invited_by=user.id))
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(409, "Уже в команде или приглашен")
    return ParticipantOut(user=UserOut.model_validate(target), status=ParticipantStatus.INVITED)


@router.delete("/quests/{quest_id}/participants/{user_id}", status_code=204)
async def remove_participant(quest_id: int, user_id: int, user: User = Depends(current_user),
                             db: AsyncSession = Depends(get_db)):
    """Ответственный отзывает приглашение или убирает участника до отправки отчета."""
    await _lead_quest(db, quest_id, user)
    if user_id == user.id:
        raise HTTPException(409, "Ответственного убрать нельзя")
    await db.execute(
        delete(QuestParticipant).where(QuestParticipant.quest_id == quest_id, QuestParticipant.user_id == user_id)
    )
    await db.commit()


@router.post("/quests/{quest_id}/participation", response_model=ParticipantOut)
async def respond(quest_id: int, body: RespondIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Приглашенный подтверждает или отклоняет участие. После отправки отчета — нельзя."""
    quest = await db.get(Quest, quest_id)
    if quest is None or quest.status != QuestStatus.IN_PROGRESS:
        raise HTTPException(409, "Состав уже зафиксирован")
    status = ParticipantStatus.CONFIRMED if body.accept else ParticipantStatus.DECLINED
    res = await db.execute(
        update(QuestParticipant)
        .where(QuestParticipant.quest_id == quest_id, QuestParticipant.user_id == user.id,
               QuestParticipant.status == ParticipantStatus.INVITED)
        .values(status=status)
    )
    await db.commit()
    if res.rowcount != 1:
        raise HTTPException(404, "Приглашения нет или вы уже ответили")
    return ParticipantOut(user=UserOut.model_validate(user), status=status)


@router.get("/me/invitations", response_model=list[InvitationOut])
async def my_invitations(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.execute(
        select(QuestParticipant, Quest).join(Quest, Quest.id == QuestParticipant.quest_id)
        .where(QuestParticipant.user_id == user.id, QuestParticipant.status == ParticipantStatus.INVITED,
               Quest.status == QuestStatus.IN_PROGRESS)
    )
    out = []
    for p, q in rows.all():
        inviter = await db.get(User, p.invited_by) if p.invited_by else None
        out.append(InvitationOut(quest=QuestOut.model_validate(q), status=p.status,
                                 invited_by=UserOut.model_validate(inviter) if inviter else None))
    return out


# ---------- отчет ----------

@router.post("/quests/{quest_id}/submissions", response_model=SubmissionOut, status_code=201)
async def submit_result(
    quest_id: int,
    background: BackgroundTasks,
    photo: UploadFile = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Фото выполнения, только ответственный. Фиксирует состав: XP получат только confirmed.
    Повторно можно, если прошлое фото отклонено (квест снова in_progress)."""
    photo_url = await storage.save_photo(photo)
    res = await db.execute(
        update(Quest)
        .where(Quest.id == quest_id, Quest.status == QuestStatus.IN_PROGRESS, Quest.executor_id == user.id)
        .values(status=QuestStatus.PENDING_VERIFICATION)
    )
    if res.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Вы не ответственный за квест или он уже на проверке")
    sub = Submission(quest_id=quest_id, user_id=user.id, photo_url=photo_url, status=SubmissionStatus.AI_REVIEW)
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    background.add_task(services.run_submission_check, sub.id)
    return submission_out(sub)


@router.get("/submissions/{submission_id}", response_model=SubmissionOut)
async def get_submission(submission_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    sub = await db.get(Submission, submission_id)
    if sub is None or sub.user_id != user.id:
        raise HTTPException(404, "Отчет не найден")
    return submission_out(sub)
