"""Модерация на стороне организации (глава + назначенные модераторы).
Квесты организации: AI предложил название, сложность и XP -> модератор правит и публикует или блокирует.
Выполнение: AI поставил % -> чат с AI (до MAX_REVIEW_ROUNDS аргументов) -> решение организации.
Решать по отчету нельзя тому, кто сам участвовал в выполнении."""
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import config, services
from ..auth import current_user
from ..database import get_db
from ..models import ModerationAction, Quest, QuestStatus, ReviewMessage, Submission, SubmissionStatus, User
from ..schemas import (
    ActionOut, ArgueIn, BlockIn, ModQuestDetailOut, ModQuestOut, PercentDecisionIn, QuestEditIn, QuestOut,
    ReasonIn, ReviewMessageOut, ReviewSubmissionOut, UserOut,
)

router = APIRouter(prefix="/organizations/{org_id}/moderation", tags=["organization moderation"])


async def org_moderator(org_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> User:
    if not await services.is_org_moderator(db, org_id, user.id):
        raise HTTPException(403, "Только для модераторов организации")
    return user


# ---------- общие помощники (их же использует панель модератора приложения) ----------

async def user_out(db: AsyncSession, user_id) -> Optional[UserOut]:
    u = await db.get(User, user_id) if user_id else None
    return UserOut.model_validate(u) if u else None


async def mod_quest_out(db: AsyncSession, q: Quest) -> ModQuestOut:
    return ModQuestOut(**QuestOut.model_validate(q).model_dump(), ai_result=q.ai_result,
                       moderator_note=q.moderator_note, author=await user_out(db, q.created_by),
                       hazard=services.is_hazard(q))


async def history(db: AsyncSession, target_type: str, target_id: int) -> list[ActionOut]:
    rows = await db.scalars(
        select(ModerationAction)
        .where(ModerationAction.target_type == target_type, ModerationAction.target_id == target_id)
        .order_by(ModerationAction.id)
    )
    return [ActionOut.model_validate(a) for a in rows.all()]


async def edit_quest(db: AsyncSession, quest: Quest, body: QuestEditIn, moderator_id: int) -> ModQuestOut:
    """Поправить предложение AI до публикации. difficulty без reward_xp — XP по таблице."""
    if quest.status not in QuestStatus.REVIEW:
        raise HTTPException(409, "Редактировать можно только до публикации")
    changes = body.model_dump(exclude_unset=True)
    if "difficulty" in changes and "reward_xp" not in changes:
        changes["reward_xp"] = config.REWARD_TABLE[changes["difficulty"]]
    if not changes:
        return await mod_quest_out(db, quest)
    quest_id, before = quest.id, services.quest_snapshot(quest)
    res = await db.execute(
        update(Quest).where(Quest.id == quest_id, Quest.status.in_(QuestStatus.REVIEW)).values(**changes)
    )
    if res.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Квест уже опубликован или заблокирован")
    await db.refresh(quest)
    services.log_action(db, "quest", quest_id, "edit", moderator_id=moderator_id, before=before,
                        after=services.quest_snapshot(quest))
    await db.commit()
    return await mod_quest_out(db, quest)


async def review_out(db: AsyncSession, sub: Submission, viewer_id: int) -> ReviewSubmissionOut:
    quest = await db.get(Quest, sub.quest_id)
    rows = (await db.scalars(
        select(ReviewMessage).where(ReviewMessage.submission_id == sub.id).order_by(ReviewMessage.id)
    )).all()
    messages = [
        ReviewMessageOut.model_validate(m).model_copy(update={"user": await user_out(db, m.user_id)}) for m in rows
    ]
    can_review = sub.status == SubmissionStatus.ORG_REVIEW and viewer_id in await services.reviewer_ids(db, quest)
    return ReviewSubmissionOut(
        id=sub.id, quest_id=sub.quest_id, photo_url=sub.photo_url, status=sub.status,
        final_percent=sub.final_percent, awarded_xp=sub.awarded_xp, moderator_note=sub.moderator_note,
        created_at=sub.created_at, quest=QuestOut.model_validate(quest), executor=await user_out(db, sub.user_id),
        ai_failed=sub.ai_failed, ai_percent=sub.ai_percent, org_percent=sub.org_percent, org_rounds=sub.org_rounds,
        rounds_left=max(0, config.MAX_REVIEW_ROUNDS - sub.org_rounds), ai_revisions=sub.ai_revisions,
        disputed=sub.disputed, messages=messages, can_review=can_review,
    )


# ---------- квесты организации ----------

async def _own_quest(db: AsyncSession, org_id: int, quest_id: int) -> Quest:
    quest = await db.get(Quest, quest_id)
    if quest is None or quest.owner_org_id != org_id:
        raise HTTPException(404, "Квест не найден")
    return quest


@router.get("/quests", response_model=list[ModQuestOut])
async def quests_queue(
    org_id: int,
    status: Literal["pending", "available", "blocked", "all"] = "pending",
    _: User = Depends(org_moderator),
    db: AsyncSession = Depends(get_db),
):
    """pending — очередь (ai_processing + pending_moderation); available/blocked — обработанные."""
    q = select(Quest).where(Quest.owner_org_id == org_id)
    if status == "pending":
        q = q.where(Quest.status.in_(QuestStatus.REVIEW))
    elif status != "all":
        q = q.where(Quest.status == status)
    rows = (await db.scalars(q.order_by(Quest.id.desc() if status != "pending" else Quest.id).limit(200))).all()
    return [await mod_quest_out(db, x) for x in rows]


@router.get("/quests/{quest_id}", response_model=ModQuestDetailOut)
async def quest_detail(org_id: int, quest_id: int, _: User = Depends(org_moderator),
                       db: AsyncSession = Depends(get_db)):
    quest = await _own_quest(db, org_id, quest_id)
    return ModQuestDetailOut(**(await mod_quest_out(db, quest)).model_dump(),
                             history=await history(db, "quest", quest_id))


@router.patch("/quests/{quest_id}", response_model=ModQuestOut)
async def edit(org_id: int, quest_id: int, body: QuestEditIn, mod: User = Depends(org_moderator),
               db: AsyncSession = Depends(get_db)):
    return await edit_quest(db, await _own_quest(db, org_id, quest_id), body, mod.id)


@router.post("/quests/{quest_id}/publish", response_model=ModQuestOut)
async def publish(org_id: int, quest_id: int, body: Optional[ReasonIn] = None, mod: User = Depends(org_moderator),
                  db: AsyncSession = Depends(get_db)):
    """Можно публиковать и вопреки отказу AI, кроме hazard — такой квест публикует модератор приложения."""
    quest = await _own_quest(db, org_id, quest_id)
    if services.is_hazard(quest):
        raise HTTPException(409, "AI отметил опасность — опубликовать может только модератор приложения")
    reason = body.reason if body else None
    if (quest.ai_result or {}).get("approved") is False:
        reason = reason or "Опубликовано вопреки отказу AI"
    if not await services.publish_quest(db, quest_id, moderator_id=mod.id, reason=reason):
        raise HTTPException(409, "Квест не ожидает модерации")
    await db.refresh(quest)
    return await mod_quest_out(db, quest)


@router.post("/quests/{quest_id}/block", response_model=ModQuestOut)
async def block(org_id: int, quest_id: int, body: BlockIn, mod: User = Depends(org_moderator),
                db: AsyncSession = Depends(get_db)):
    quest = await _own_quest(db, org_id, quest_id)
    if not await services.block_quest(db, quest_id, body.reason, moderator_id=mod.id):
        raise HTTPException(409, "Квест не ожидает модерации")
    await db.refresh(quest)
    return await mod_quest_out(db, quest)


# ---------- проверка выполнения: чат с AI ----------

async def _own_submission(db: AsyncSession, org_id: int, submission_id: int) -> Submission:
    sub = await db.get(Submission, submission_id)
    quest = await db.get(Quest, sub.quest_id) if sub else None
    if quest is None or quest.owner_org_id != org_id:
        raise HTTPException(404, "Отчет не найден")
    return sub


async def _reviewer(db: AsyncSession, sub: Submission, user: User):
    quest = await db.get(Quest, sub.quest_id)
    if user.id in await services.executor_ids(db, quest):
        raise HTTPException(403, "Нельзя проверять выполнение, в котором вы участвовали")


@router.get("/submissions", response_model=list[ReviewSubmissionOut])
async def submissions_queue(
    org_id: int,
    status: Literal["review", "platform", "decided", "all"] = "review",
    mod: User = Depends(org_moderator),
    db: AsyncSession = Depends(get_db),
):
    """review — ждут AI или решения организации; platform — замороженные спорные решения;
    decided — с итогом."""
    q = select(Submission).join(Quest, Quest.id == Submission.quest_id).where(Quest.owner_org_id == org_id)
    if status == "review":
        q = q.where(Submission.status.in_((SubmissionStatus.AI_REVIEW, SubmissionStatus.ORG_REVIEW)))
    elif status == "platform":
        q = q.where(Submission.status == SubmissionStatus.PLATFORM_REVIEW)
    elif status == "decided":
        q = q.where(Submission.status.in_((SubmissionStatus.APPROVED, SubmissionStatus.REJECTED)))
    rows = (await db.scalars(q.order_by(Submission.id).limit(200))).all()
    return [await review_out(db, s, mod.id) for s in rows]


@router.get("/submissions/{submission_id}", response_model=ReviewSubmissionOut)
async def submission_detail(org_id: int, submission_id: int, mod: User = Depends(org_moderator),
                            db: AsyncSession = Depends(get_db)):
    return await review_out(db, await _own_submission(db, org_id, submission_id), mod.id)


@router.post("/submissions/{submission_id}/messages", response_model=ReviewSubmissionOut)
async def argue(org_id: int, submission_id: int, body: ArgueIn, background: BackgroundTasks,
                mod: User = Depends(org_moderator), db: AsyncSession = Depends(get_db)):
    """Оспорить оценку AI: свой % + аргумент. AI пересмотрит в фоне (статус ai_review -> org_review).
    Не больше MAX_REVIEW_ROUNDS раз; дальше — только решение."""
    sub = await _own_submission(db, org_id, submission_id)
    await _reviewer(db, sub, mod)
    status, failed, rounds = sub.status, sub.ai_failed, sub.org_rounds
    if not await services.org_argue(db, submission_id, mod.id, body.percent, body.text):
        if status != SubmissionStatus.ORG_REVIEW:
            raise HTTPException(409, "Отчет не ждет решения организации")
        if failed:
            raise HTTPException(409, "AI недоступен: решите вручную или повторите проверку AI")
        if rounds >= config.MAX_REVIEW_ROUNDS:
            raise HTTPException(409, f"Лимит {config.MAX_REVIEW_ROUNDS} правок исчерпан — примите решение")
        raise HTTPException(409, "Отчет не ждет решения организации")
    background.add_task(services.run_reconsider, submission_id)
    await db.refresh(sub)
    return await review_out(db, sub, mod.id)


@router.post("/submissions/{submission_id}/decision", response_model=ReviewSubmissionOut)
async def decide(org_id: int, submission_id: int, body: PercentDecisionIn, mod: User = Depends(org_moderator),
                 db: AsyncSession = Depends(get_db)):
    """Итоговый % (последнее слово за организацией). < PASS_PERCENT — отказ, квест снова in_progress;
    иначе каждому confirmed участнику reward_xp * %. Спорное решение при низком доверии
    уходит модератору приложения (status=platform_review)."""
    sub = await _own_submission(db, org_id, submission_id)
    await _reviewer(db, sub, mod)
    mod_id = mod.id
    if await services.org_decide(db, submission_id, mod_id, body.percent, body.note) is None:
        raise HTTPException(409, "Отчет не ждет решения организации")
    sub = await db.get(Submission, submission_id)
    await db.refresh(sub)
    return await review_out(db, sub, mod_id)


@router.post("/submissions/{submission_id}/retry-ai", response_model=ReviewSubmissionOut)
async def retry_ai(org_id: int, submission_id: int, background: BackgroundTasks,
                   mod: User = Depends(org_moderator), db: AsyncSession = Depends(get_db)):
    """Повторить первичную проверку, если AI упал."""
    sub = await _own_submission(db, org_id, submission_id)
    mod_id = mod.id
    if not await services.retry_ai(db, submission_id):
        raise HTTPException(409, "AI-проверка не падала или отчет уже решен")
    background.add_task(services.run_submission_check, submission_id)
    await db.refresh(sub)
    return await review_out(db, sub, mod_id)
