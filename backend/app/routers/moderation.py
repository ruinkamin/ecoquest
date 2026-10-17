"""Панель модератора приложения (role=moderator): заявки организаций и партнеров, квесты с hazard,
замороженные спорные решения организаций, доверие организаций. Квесты и выполнение в обычном
режиме модерируют сами организации (org_moderation.py). Все действия пишутся в moderation_actions."""
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import services
from ..auth import require_moderator
from ..database import get_db
from ..models import ModerationAction, Organization, OrgStatus, Partner, Quest, QuestStatus, Submission, SubmissionStatus, User
from ..schemas import (
    ActionOut, BlockIn, DecisionIn, ModQuestDetailOut, ModQuestOut, OrgOut, OrgTrustOut, PartnerOut,
    PercentDecisionIn, QuestEditIn, ReasonIn, ReviewSubmissionOut, TrustOut,
)
from .org_moderation import edit_quest, history, mod_quest_out, review_out

router = APIRouter(prefix="/moderation", tags=["moderation"], dependencies=[Depends(require_moderator)])


# ---------- квесты: опасные (hazard) и любые ожидающие ----------

@router.get("/quests", response_model=list[ModQuestOut])
async def quests_queue(
    status: Literal["hazard", "pending", "available", "blocked", "all"] = "hazard",
    db: AsyncSession = Depends(get_db),
):
    """hazard — ждут модератора приложения (AI отметил опасность); pending — все ожидающие организаций."""
    q = select(Quest)
    if status in ("hazard", "pending"):
        q = q.where(Quest.status.in_(QuestStatus.REVIEW))
    elif status != "all":
        q = q.where(Quest.status == status)
    rows = (await db.scalars(q.order_by(Quest.id.desc() if status not in ("hazard", "pending") else Quest.id)
                             .limit(200))).all()
    if status == "hazard":
        rows = [x for x in rows if services.is_hazard(x)]
    return [await mod_quest_out(db, x) for x in rows]


@router.get("/quests/{quest_id}", response_model=ModQuestDetailOut)
async def quest_detail(quest_id: int, db: AsyncSession = Depends(get_db)):
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(404, "Квест не найден")
    return ModQuestDetailOut(**(await mod_quest_out(db, quest)).model_dump(),
                             history=await history(db, "quest", quest_id))


@router.patch("/quests/{quest_id}", response_model=ModQuestOut)
async def edit(quest_id: int, body: QuestEditIn, db: AsyncSession = Depends(get_db),
               mod: User = Depends(require_moderator)):
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(404, "Квест не найден")
    return await edit_quest(db, quest, body, mod.id)


@router.post("/quests/{quest_id}/publish", response_model=ModQuestOut)
async def publish(quest_id: int, body: Optional[ReasonIn] = None, db: AsyncSession = Depends(get_db),
                  mod: User = Depends(require_moderator)):
    if not await services.publish_quest(db, quest_id, moderator_id=mod.id, reason=body.reason if body else None):
        raise HTTPException(409, "Квест не ожидает модерации")
    quest = await db.get(Quest, quest_id)
    await db.refresh(quest)
    return await mod_quest_out(db, quest)


@router.post("/quests/{quest_id}/block", response_model=ModQuestOut)
async def block(quest_id: int, body: BlockIn, db: AsyncSession = Depends(get_db),
                mod: User = Depends(require_moderator)):
    if not await services.block_quest(db, quest_id, body.reason, moderator_id=mod.id):
        raise HTTPException(409, "Квест не ожидает модерации")
    quest = await db.get(Quest, quest_id)
    await db.refresh(quest)
    return await mod_quest_out(db, quest)


# ---------- выполнение: замороженные спорные решения ----------

@router.get("/submissions", response_model=list[ReviewSubmissionOut])
async def submissions_queue(db: AsyncSession = Depends(get_db), mod: User = Depends(require_moderator)):
    """Спорные решения организаций с низким доверием (org_percent — что предложила организация,
    ai_percent — последняя оценка AI) и отчеты, которые некому проверить, если AI упал."""
    rows = (await db.scalars(
        select(Submission).where(Submission.status == SubmissionStatus.PLATFORM_REVIEW).order_by(Submission.id)
    )).all()
    return [await review_out(db, s, mod.id) for s in rows]


@router.post("/submissions/{submission_id}/decision", response_model=ReviewSubmissionOut)
async def decide_submission(submission_id: int, body: PercentDecisionIn, db: AsyncSession = Depends(get_db),
                            mod: User = Depends(require_moderator)):
    """Итоговый % вместо организации: подтвердить ее решение (percent = org_percent) или поставить свой."""
    mod_id = mod.id
    if not await services.platform_decide(db, submission_id, mod_id, body.percent, body.note):
        raise HTTPException(409, "Отчет не ждет модератора приложения")
    sub = await db.get(Submission, submission_id)
    await db.refresh(sub)
    return await review_out(db, sub, mod_id)


@router.post("/submissions/{submission_id}/retry-ai", response_model=ReviewSubmissionOut)
async def retry_ai(submission_id: int, background: BackgroundTasks, db: AsyncSession = Depends(get_db),
                   mod: User = Depends(require_moderator)):
    mod_id = mod.id
    if not await services.retry_ai(db, submission_id):
        raise HTTPException(409, "AI-проверка не падала или отчет уже решен")
    background.add_task(services.run_submission_check, submission_id)
    sub = await db.get(Submission, submission_id)
    await db.refresh(sub)
    return await review_out(db, sub, mod_id)


# ---------- заявки на организации и партнеров ----------

async def _decide_application(db: AsyncSession, model, target_type: str, obj_id: int, body: DecisionIn,
                              moderator_id: int):
    status = OrgStatus.APPROVED if body.approved else OrgStatus.REJECTED
    res = await db.execute(
        update(model).where(model.id == obj_id, model.status == OrgStatus.PENDING)
        .values(status=status, moderator_note=body.note)
    )
    if res.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Заявка не ожидает проверки")
    services.log_action(db, target_type, obj_id, "approve" if body.approved else "reject",
                        moderator_id=moderator_id, reason=body.note,
                        before={"status": OrgStatus.PENDING}, after={"status": status})
    await db.commit()
    obj = await db.get(model, obj_id)
    await db.refresh(obj)
    return obj


@router.get("/organizations", response_model=list[OrgOut])
async def org_requests(db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(Organization).where(Organization.status == OrgStatus.PENDING).order_by(Organization.id)
    )
    return rows.all()


@router.post("/organizations/{org_id}/decision", response_model=OrgOut)
async def decide_org(org_id: int, body: DecisionIn, db: AsyncSession = Depends(get_db),
                     mod: User = Depends(require_moderator)):
    return await _decide_application(db, Organization, "organization", org_id, body, mod.id)


@router.get("/organizations/trust", response_model=list[OrgTrustOut])
async def orgs_trust(db: AsyncSession = Depends(get_db)):
    """Доверие одобренных организаций: сначала те, чьи спорные решения уже ждут модератора приложения."""
    orgs = (await db.scalars(select(Organization).where(Organization.status == OrgStatus.APPROVED))).all()
    out = [OrgTrustOut(organization=OrgOut.model_validate(o), trust=TrustOut(**await services.org_trust(db, o.id)))
           for o in orgs]
    return sorted(out, key=lambda x: (not x.trust.under_review, -x.trust.disputed_ratio))


@router.get("/partners", response_model=list[PartnerOut])
async def partner_requests(db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(Partner).where(Partner.status == OrgStatus.PENDING).order_by(Partner.id))
    return rows.all()


@router.post("/partners/{partner_id}/decision", response_model=PartnerOut)
async def decide_partner(partner_id: int, body: DecisionIn, db: AsyncSession = Depends(get_db),
                         mod: User = Depends(require_moderator)):
    return await _decide_application(db, Partner, "partner", partner_id, body, mod.id)


# ---------- журнал ----------

@router.get("/actions", response_model=list[ActionOut])
async def actions_log(
    target_type: Optional[Literal["quest", "submission", "organization", "partner"]] = None,
    target_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(ModerationAction)
    if target_type:
        q = q.where(ModerationAction.target_type == target_type)
    if target_id is not None:
        q = q.where(ModerationAction.target_id == target_id)
    rows = await db.scalars(q.order_by(ModerationAction.id.desc()).limit(min(limit, 500)))
    return [ActionOut.model_validate(a) for a in rows.all()]
