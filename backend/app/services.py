"""Переходы статусов и начисления. Все переходы — атомарный UPDATE ... WHERE status IN (...),
поэтому повторный вызов или гонка двух запросов не дают двойного эффекта.

Квест создает организация: AI предлагает название, сложность и XP -> модератор организации правит
и публикует (квест с hazard публикует только модератор приложения).
Выполнение: AI ставит % -> чат AI и модератора организации (до MAX_REVIEW_ROUNDS аргументов,
AI каждый раз пересматривает) -> решение организации. Спорное решение организации с низким
доверием ждет модератора приложения. AI упал -> организация решает вручную."""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from . import ai, config, storage
from .database import SessionLocal
from .models import (
    ModerationAction, Organization, OrganizationMember, OrgLedger, OrgRole, OrgStatus, ParticipantStatus, Quest,
    QuestParticipant, QuestStatus, ReviewMessage, Submission, SubmissionStatus, XpLedger,
)

log = logging.getLogger("ecoquest")

EDITABLE_QUEST_FIELDS = ("title", "description", "difficulty", "reward_xp")


async def xp_balance(db: AsyncSession, user_id: int) -> tuple[int, int]:
    """(lifetime_xp — всё заработанное, spendable_xp — можно потратить)."""
    row = (await db.execute(
        select(
            func.coalesce(func.sum(case((XpLedger.delta > 0, XpLedger.delta), else_=0)), 0),
            func.coalesce(func.sum(XpLedger.delta), 0),
        ).where(XpLedger.user_id == user_id)
    )).one()
    return int(row[0]), int(row[1])


async def org_points(db: AsyncSession, org_id: int) -> int:
    return int(await db.scalar(
        select(func.coalesce(func.sum(OrgLedger.delta), 0)).where(OrgLedger.organization_id == org_id)
    ))


def level_for(lifetime_xp: int) -> int:
    return 1 + lifetime_xp // config.XP_PER_LEVEL


def clamp_difficulty(value) -> int:
    try:
        return min(5, max(1, int(value)))
    except (TypeError, ValueError):
        return 1


def log_action(db: AsyncSession, target_type: str, target_id: int, action: str, *,
               moderator_id=None, reason=None, before=None, after=None):
    db.add(ModerationAction(target_type=target_type, target_id=target_id, moderator_id=moderator_id,
                            action=action, reason=reason, before_json=before, after_json=after))


def quest_snapshot(q: Quest) -> dict:
    return {f: getattr(q, f) for f in EDITABLE_QUEST_FIELDS} | {"status": q.status}


def is_hazard(quest: Quest) -> bool:
    return bool((quest.ai_result or {}).get("hazard"))


# ---------- модераторы организации ----------

async def org_moderator_ids(db: AsyncSession, org_id: int) -> set[int]:
    """Глава + участники с ролью moderator. Пусто, если организация не одобрена."""
    org = await db.get(Organization, org_id)
    if org is None or org.status != OrgStatus.APPROVED:
        return set()
    rows = await db.scalars(
        select(OrganizationMember.user_id).where(
            OrganizationMember.organization_id == org_id, OrganizationMember.role == OrgRole.MODERATOR
        )
    )
    return set(rows.all()) | {org.head_id}


async def is_org_moderator(db: AsyncSession, org_id: int, user_id: int) -> bool:
    return user_id in await org_moderator_ids(db, org_id)


async def executor_ids(db: AsyncSession, quest: Quest) -> set[int]:
    """Ответственный и подтвержденные участники — им нельзя решать по своему отчету."""
    rows = await db.scalars(
        select(QuestParticipant.user_id).where(
            QuestParticipant.quest_id == quest.id, QuestParticipant.status == ParticipantStatus.CONFIRMED
        )
    )
    return set(rows.all()) | ({quest.executor_id} if quest.executor_id else set())


async def reviewer_ids(db: AsyncSession, quest: Quest) -> set[int]:
    """Кто может проверять выполнение: модераторы организации-владельца, не участвовавшие в нем."""
    return await org_moderator_ids(db, quest.owner_org_id) - await executor_ids(db, quest)


# ---------- публикация квеста ----------

async def publish_quest(db: AsyncSession, quest_id: int, moderator_id=None, reason=None) -> bool:
    quest = await db.get(Quest, quest_id)
    if quest is None:
        return False
    before = quest_snapshot(quest)
    d = clamp_difficulty(quest.difficulty or 1)
    res = await db.execute(
        update(Quest).where(Quest.id == quest_id, Quest.status.in_(QuestStatus.REVIEW)).values(
            status=QuestStatus.AVAILABLE, difficulty=d, reward_xp=quest.reward_xp or config.REWARD_TABLE[d],
            published_at=datetime.now(timezone.utc), moderator_note=None,
        )
    )
    if res.rowcount != 1:
        await db.rollback()
        return False
    log_action(db, "quest", quest_id, "publish", moderator_id=moderator_id, reason=reason, before=before,
               after=before | {"status": QuestStatus.AVAILABLE})
    await db.commit()
    return True


async def block_quest(db: AsyncSession, quest_id: int, reason: str, moderator_id=None) -> bool:
    quest = await db.get(Quest, quest_id)
    if quest is None:
        return False
    before = quest_snapshot(quest)
    res = await db.execute(
        update(Quest).where(Quest.id == quest_id, Quest.status.in_(QuestStatus.REVIEW))
        .values(status=QuestStatus.BLOCKED, moderator_note=reason)
    )
    if res.rowcount != 1:
        await db.rollback()
        return False
    log_action(db, "quest", quest_id, "block", moderator_id=moderator_id, reason=reason, before=before,
               after=before | {"status": QuestStatus.BLOCKED})
    await db.commit()
    return True


async def run_quest_check(quest_id: int):
    """Фоновая задача после создания квеста: AI записывает предложение, квест ждет модератора организации."""
    async with SessionLocal() as db:
        quest = await db.get(Quest, quest_id)
        if quest is None or quest.status != QuestStatus.AI_PROCESSING:
            return
        photo = storage.load_photo(quest.photo_url)
        try:
            if photo is None:
                raise ai.AIError("фото не найдено")
            result = await ai.check_quest(photo, quest.description or "")
        except ai.AIError as e:
            log.warning("AI check for quest %s failed: %s", quest_id, e)
            result = {"error": str(e)}

        # Предложение AI сразу подставляем в поля — модератору достаточно поправить и опубликовать.
        values = {"status": QuestStatus.PENDING_MODERATION, "ai_result": result}
        if "error" not in result:
            d = clamp_difficulty(result.get("difficulty"))
            values.update(difficulty=d, reward_xp=config.REWARD_TABLE[d])
            if not quest.title and result.get("title"):
                values["title"] = result["title"]
        await db.execute(
            update(Quest).where(Quest.id == quest_id, Quest.status == QuestStatus.AI_PROCESSING).values(**values)
        )
        await db.commit()


# ---------- выполнение: чат AI и организации ----------

def is_disputed(org_percent: int, ai_percent: Optional[int]) -> bool:
    """Решение расходится с AI: разница больше DISPUTE_DELTA или другой вердикт."""
    if ai_percent is None:
        return False
    passed = (org_percent >= config.PASS_PERCENT, ai_percent >= config.PASS_PERCENT)
    return abs(org_percent - ai_percent) > config.DISPUTE_DELTA or passed[0] != passed[1]


async def _recent_decisions(db: AsyncSession, org_id: int, limit: int) -> list[bool]:
    """Флаги disputed последних решений организации (новые первыми)."""
    rows = await db.scalars(
        select(Submission.disputed).join(Quest, Quest.id == Submission.quest_id)
        .where(Quest.owner_org_id == org_id, Submission.org_percent.is_not(None))
        .order_by(Submission.decided_at.desc(), Submission.id.desc()).limit(limit)
    )
    return list(rows.all())


def _trust(flags: list[bool]) -> dict:
    n, disputed = len(flags), sum(flags)
    ratio = disputed / n if n else 0.0
    return {
        "decisions": n, "disputed": disputed, "disputed_ratio": round(ratio, 2),
        "under_review": n >= config.TRUST_MIN_DECISIONS and ratio > config.TRUST_THRESHOLD,
    }


async def org_trust(db: AsyncSession, org_id: int) -> dict:
    """Публичная метрика доверия по последним TRUST_WINDOW решениям."""
    return _trust(await _recent_decisions(db, org_id, config.TRUST_WINDOW))


def _message(db: AsyncSession, submission_id: int, author: str, percent, text, *, user_id=None, is_final=False):
    db.add(ReviewMessage(submission_id=submission_id, author=author, user_id=user_id, percent=percent,
                         text=text, is_final=is_final))


async def _award(db: AsyncSession, quest: Quest, amount: int):
    """amount XP каждому подтвержденному участнику (включая ответственного) и столько же очков организации,
    от имени которой выполняли."""
    user_ids = (await db.scalars(
        select(QuestParticipant.user_id).where(
            QuestParticipant.quest_id == quest.id, QuestParticipant.status == ParticipantStatus.CONFIRMED
        )
    )).all()
    entries = [XpLedger(user_id=u, delta=amount, kind="quest_reward", quest_id=quest.id) for u in user_ids]
    if quest.organization_id:
        entries.append(OrgLedger(organization_id=quest.organization_id, delta=amount,
                                 kind="quest_reward", quest_id=quest.id))
    for entry in entries:
        try:
            async with db.begin_nested():
                db.add(entry)
        except IntegrityError:
            log.warning("Reward for quest %s already awarded: %r", quest.id, entry)


async def finalize_submission(db: AsyncSession, submission_id: int, percent: int, *, from_statuses,
                              decided_by=None, note=None, **values) -> bool:
    """Итог: % >= PASS_PERCENT — квест completed и XP = reward_xp * %; иначе квест снова in_progress."""
    sub = await db.get(Submission, submission_id)
    if sub is None:
        return False
    quest = await db.get(Quest, sub.quest_id)
    quest_id, before_status = quest.id, sub.status
    approved = percent >= config.PASS_PERCENT
    amount = round((quest.reward_xp or 0) * percent / 100) if approved else 0
    new_status = SubmissionStatus.APPROVED if approved else SubmissionStatus.REJECTED
    values.setdefault("decided_at", datetime.now(timezone.utc))
    res = await db.execute(
        update(Submission)
        .where(Submission.id == submission_id, Submission.status.in_(from_statuses))
        .values(status=new_status, final_percent=percent, awarded_xp=amount, decided_by=decided_by,
                moderator_note=note, **values)
    )
    if res.rowcount != 1:
        await db.rollback()
        return False
    log_action(db, "submission", submission_id, "approve" if approved else "reject", moderator_id=decided_by,
               reason=note, before={"status": before_status},
               after={"status": new_status, "percent": percent, "xp": amount})

    quest_filter = (Quest.id == quest_id, Quest.status == QuestStatus.PENDING_VERIFICATION)
    if not approved:
        # Отклонено: ответственный может прислать новое фото.
        await db.execute(update(Quest).where(*quest_filter).values(status=QuestStatus.IN_PROGRESS))
    elif (await db.execute(update(Quest).where(*quest_filter).values(status=QuestStatus.COMPLETED))).rowcount == 1:
        await _award(db, quest, amount)
    await db.commit()
    return True


async def run_submission_check(submission_id: int):
    """Фоновая задача после отправки фото (и после «Повторить AI»): первичная оценка AI."""
    async with SessionLocal() as db:
        sub = await db.get(Submission, submission_id)
        if sub is None or sub.status != SubmissionStatus.AI_REVIEW:
            return
        quest = await db.get(Quest, sub.quest_id)
        after = storage.load_photo(sub.photo_url)
        try:
            if after is None:
                raise ai.AIError("фото не найдено")
            result = await ai.check_completion(storage.load_photo(quest.photo_url), after, quest.title or "")
        except ai.AIError as e:
            log.warning("AI check for submission %s failed: %s", submission_id, e)
            result = {"error": str(e)}

        failed = "error" in result
        percent = None if failed else result["percent"]
        reviewers = await reviewer_ids(db, quest)
        _message(db, submission_id, "ai", percent, result.get("reason") or result.get("error"))
        if not failed and not reviewers:
            # Проверить некому (все модераторы организации сами выполняли) — итог за AI.
            await db.flush()
            await finalize_submission(db, submission_id, percent, from_statuses=(SubmissionStatus.AI_REVIEW,),
                                      ai_result=result, ai_percent=percent, note=result.get("reason"))
            return
        # AI упал и проверить некому — решает модератор приложения.
        status = SubmissionStatus.ORG_REVIEW if reviewers else SubmissionStatus.PLATFORM_REVIEW
        await db.execute(
            update(Submission)
            .where(Submission.id == submission_id, Submission.status == SubmissionStatus.AI_REVIEW)
            .values(status=status, ai_result=result, ai_percent=percent, ai_failed=failed)
        )
        await db.commit()


async def org_argue(db: AsyncSession, submission_id: int, user_id: int, percent: int, text: str) -> bool:
    """Модератор организации оспаривает оценку AI. Следом — фоновый run_reconsider."""
    res = await db.execute(
        update(Submission)
        .where(Submission.id == submission_id, Submission.status == SubmissionStatus.ORG_REVIEW,
               Submission.ai_failed.is_(False), Submission.org_rounds < config.MAX_REVIEW_ROUNDS)
        .values(status=SubmissionStatus.AI_REVIEW, org_rounds=Submission.org_rounds + 1)
    )
    if res.rowcount != 1:
        await db.rollback()
        return False
    _message(db, submission_id, "org", percent, text, user_id=user_id)
    await db.commit()
    return True


async def run_reconsider(submission_id: int):
    """Фоновая задача: AI отвечает на аргумент организации, может изменить оценку."""
    async with SessionLocal() as db:
        sub = await db.get(Submission, submission_id)
        if sub is None or sub.status != SubmissionStatus.AI_REVIEW:
            return
        quest = await db.get(Quest, sub.quest_id)
        history = [(m.author, m.percent, m.text) for m in (await db.scalars(
            select(ReviewMessage).where(ReviewMessage.submission_id == submission_id).order_by(ReviewMessage.id)
        )).all()]
        old = sub.ai_percent
        try:
            after = storage.load_photo(sub.photo_url)
            if after is None:
                raise ai.AIError("фото не найдено")
            result = await ai.reconsider(storage.load_photo(quest.photo_url), after, quest.title or "", history)
        except ai.AIError as e:
            # Оценка AI остается прежней, раунд организации потрачен — решать можно по старой оценке.
            log.warning("AI reconsider for submission %s failed: %s", submission_id, e)
            _message(db, submission_id, "ai", None, f"AI недоступний: {e}")
            values = {}
        else:
            _message(db, submission_id, "ai", result["percent"], result["reason"])
            values = {"ai_percent": result["percent"]}
            if result["percent"] != old:
                values["ai_revisions"] = Submission.ai_revisions + 1
        await db.execute(
            update(Submission)
            .where(Submission.id == submission_id, Submission.status == SubmissionStatus.AI_REVIEW)
            .values(status=SubmissionStatus.ORG_REVIEW, **values)
        )
        await db.commit()


async def org_decide(db: AsyncSession, submission_id: int, user_id: int, percent: int, note=None) -> Optional[str]:
    """Решение модератора организации. Возвращает новый статус отчета или None, если он не ждет решения.
    Спорное решение при низком доверии уходит модератору приложения (platform_review)."""
    sub = await db.get(Submission, submission_id)
    if sub is None or sub.status != SubmissionStatus.ORG_REVIEW:
        return None
    quest = await db.get(Quest, sub.quest_id)
    disputed = not sub.ai_failed and is_disputed(percent, sub.ai_percent)
    under_review = False
    if disputed:
        flags = [True] + await _recent_decisions(db, quest.owner_org_id, config.TRUST_WINDOW - 1)
        under_review = _trust(flags)["under_review"]
    now = datetime.now(timezone.utc)
    _message(db, submission_id, "org", percent, note, user_id=user_id, is_final=True)
    if not under_review:
        await db.flush()
        ok = await finalize_submission(db, submission_id, percent, from_statuses=(SubmissionStatus.ORG_REVIEW,),
                                       decided_by=user_id, note=note, org_percent=percent, disputed=disputed,
                                       decided_at=now)
        if not ok:
            return None
        return SubmissionStatus.APPROVED if percent >= config.PASS_PERCENT else SubmissionStatus.REJECTED
    res = await db.execute(
        update(Submission)
        .where(Submission.id == submission_id, Submission.status == SubmissionStatus.ORG_REVIEW)
        .values(status=SubmissionStatus.PLATFORM_REVIEW, org_percent=percent, disputed=True,
                decided_by=user_id, decided_at=now, moderator_note=note)
    )
    if res.rowcount != 1:
        await db.rollback()
        return None
    log_action(db, "submission", submission_id, "escalate", moderator_id=user_id,
               reason="Спорное решение при низком доверии организации",
               before={"status": SubmissionStatus.ORG_REVIEW},
               after={"status": SubmissionStatus.PLATFORM_REVIEW, "percent": percent})
    await db.commit()
    return SubmissionStatus.PLATFORM_REVIEW


async def platform_decide(db: AsyncSession, submission_id: int, moderator_id: int, percent: int, note=None) -> bool:
    """Модератор приложения выносит итог по замороженному решению (или если проверить некому)."""
    _message(db, submission_id, "platform", percent, note, user_id=moderator_id, is_final=True)
    await db.flush()
    return await finalize_submission(db, submission_id, percent, from_statuses=(SubmissionStatus.PLATFORM_REVIEW,),
                                     decided_by=moderator_id, note=note)


async def retry_ai(db: AsyncSession, submission_id: int) -> bool:
    """«Повторить AI», если первичная проверка упала. Следом — фоновый run_submission_check."""
    res = await db.execute(
        update(Submission)
        .where(Submission.id == submission_id, Submission.ai_failed.is_(True),
               or_(Submission.status == SubmissionStatus.ORG_REVIEW,
                   Submission.status == SubmissionStatus.PLATFORM_REVIEW))
        .values(status=SubmissionStatus.AI_REVIEW, ai_failed=False)
    )
    if res.rowcount != 1:
        await db.rollback()
        return False
    await db.commit()
    return True
