"""Организации. Создаются по заявке (одобряет модератор приложения). Главный аккаунт (head)
привязывает и отвязывает участников и назначает модераторов организации (role=moderator): они
создают и публикуют квесты организации и проверяют их выполнение. Очки организации начисляются
автоматически за квесты, взятые от ее имени. Доверие (trust) — доля решений вопреки AI."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import services
from ..auth import current_user, normalize_email, optional_user
from ..database import get_db
from ..models import Organization, OrganizationMember, OrgRole, OrgStatus, Quest, QuestStatus, Role, User
from ..schemas import MemberIn, MemberOut, MemberRoleIn, OrgCreateIn, OrgDetailOut, OrgOut, TrustOut, UserOut

router = APIRouter(tags=["organizations"])


async def _org_out(db: AsyncSession, org: Organization) -> OrgOut:
    return OrgOut.model_validate(org).model_copy(update={"points": await services.org_points(db, org.id)})


async def _member_ids(db: AsyncSession, org_id: int) -> list[int]:
    rows = await db.scalars(select(OrganizationMember.user_id).where(OrganizationMember.organization_id == org_id))
    return list(rows.all())


async def _head_org(db: AsyncSession, org_id: int, user: User) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Организация не найдена")
    if org.head_id != user.id:
        raise HTTPException(403, "Только для главного аккаунта организации")
    if org.status != OrgStatus.APPROVED:
        raise HTTPException(409, "Организация еще не одобрена")
    return org


@router.post("/organizations", response_model=OrgOut, status_code=201)
async def apply_for_organization(body: OrgCreateIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Заявка на создание. Профиль активен только после одобрения модератором; подавший — главный аккаунт."""
    pending = await db.scalar(
        select(Organization.id).where(Organization.head_id == user.id, Organization.status == OrgStatus.PENDING)
    )
    if pending:
        raise HTTPException(409, "У вас уже есть заявка на рассмотрении")
    org = Organization(name=body.name.strip(), description=body.description, logo_url=body.logo_url, head_id=user.id)
    db.add(org)
    await db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=OrgRole.MODERATOR))
    await db.commit()
    await db.refresh(org)
    return await _org_out(db, org)


@router.get("/organizations", response_model=list[OrgOut])
async def list_organizations(db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(Organization).where(Organization.status == OrgStatus.APPROVED))
    return [await _org_out(db, o) for o in rows.all()]


@router.get("/me/organizations", response_model=list[OrgOut])
async def my_organizations(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Где я участник или глава (включая свои заявки — для показа статуса).
    Для выбора в «Взять от организации» фильтровать status=approved."""
    member_of = select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user.id)
    rows = await db.scalars(
        select(Organization).where(or_(Organization.id.in_(member_of), Organization.head_id == user.id))
    )
    return [await _org_out(db, o) for o in rows.all()]


@router.get("/organizations/{org_id}", response_model=OrgDetailOut)
async def get_organization(org_id: int, user: Optional[User] = Depends(optional_user),
                           db: AsyncSession = Depends(get_db)):
    """Доступно без входа (одобренные организации). is_head / is_member / is_moderator у гостя — false."""
    uid = user.id if user else None
    org = await db.get(Organization, org_id)
    if org is None or (
        org.status != OrgStatus.APPROVED and not (user and (org.head_id == uid or user.role == Role.MODERATOR))
    ):
        raise HTTPException(404, "Организация не найдена")
    rows = (await db.execute(
        select(User, OrganizationMember.role).join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(OrganizationMember.organization_id == org.id).order_by(OrganizationMember.id)
    )).all()
    members = [
        MemberOut(**UserOut.model_validate(u).model_dump(),
                  role=OrgRole.MODERATOR if u.id == org.head_id else role)
        for u, role in rows
    ]
    head = await db.get(User, org.head_id)
    completed = await db.scalar(
        select(func.count()).where(Quest.organization_id == org.id, Quest.status == QuestStatus.COMPLETED)
    )
    return OrgDetailOut(
        **(await _org_out(db, org)).model_dump(),
        head=UserOut.model_validate(head) if head else None,
        members=members,
        completed_quests=completed,
        is_head=org.head_id == uid,
        is_member=any(m.id == uid for m in members),
        is_moderator=any(m.id == uid and m.role == OrgRole.MODERATOR for m in members),
        trust=TrustOut(**await services.org_trust(db, org.id)),
    )


@router.post("/organizations/{org_id}/members", response_model=UserOut, status_code=201)
async def add_member(org_id: int, body: MemberIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Главный аккаунт привязывает зарегистрированного пользователя по email или id."""
    await _head_org(db, org_id, user)
    if body.email:
        target = await db.scalar(select(User).where(User.email == normalize_email(body.email)))
    elif body.user_id:
        target = await db.get(User, body.user_id)
    else:
        raise HTTPException(422, "Нужен email или user_id")
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    if target.id in await _member_ids(db, org_id):
        raise HTTPException(409, "Уже участник")
    db.add(OrganizationMember(organization_id=org_id, user_id=target.id))
    await db.commit()
    return target


@router.patch("/organizations/{org_id}/members/{user_id}", response_model=MemberOut)
async def set_member_role(org_id: int, user_id: int, body: MemberRoleIn, user: User = Depends(current_user),
                          db: AsyncSession = Depends(get_db)):
    """Глава назначает (role=moderator) или снимает (role=member) модератора организации."""
    org = await _head_org(db, org_id, user)
    if user_id == org.head_id:
        raise HTTPException(409, "Глава — модератор всегда")
    res = await db.execute(
        update(OrganizationMember)
        .where(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
        .values(role=body.role)
    )
    if res.rowcount != 1:
        await db.rollback()
        raise HTTPException(404, "Не участник организации")
    await db.commit()
    target = await db.get(User, user_id)
    return MemberOut(**UserOut.model_validate(target).model_dump(), role=body.role)


@router.delete("/organizations/{org_id}/members/{user_id}", status_code=204)
async def remove_member(org_id: int, user_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Главный аккаунт отвязывает участника; участник может выйти сам. История выполнений сохраняется."""
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Организация не найдена")
    if user.id not in (org.head_id, user_id):
        raise HTTPException(403, "Только для главного аккаунта организации")
    if user_id == org.head_id:
        raise HTTPException(409, "Главный аккаунт нельзя отвязать")
    await db.execute(
        delete(OrganizationMember).where(
            OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id
        )
    )
    await db.commit()
