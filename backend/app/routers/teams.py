"""Volunteer teams joined through unique invite codes."""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..database import get_db
from ..models import User, VolunteerTeam, VolunteerTeamMember
from ..schemas import UserOut, VolunteerTeamCreateIn, VolunteerTeamJoinIn, VolunteerTeamOut

router = APIRouter(tags=["teams"])
_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


async def _team_out(db: AsyncSession, team: VolunteerTeam) -> VolunteerTeamOut:
    rows = await db.scalars(
        select(User)
        .join(VolunteerTeamMember, VolunteerTeamMember.user_id == User.id)
        .where(VolunteerTeamMember.team_id == team.id)
        .order_by(VolunteerTeamMember.id)
    )
    return VolunteerTeamOut(
        id=team.id,
        name=team.name,
        invite_code=team.invite_code,
        created_by=team.created_by,
        created_at=team.created_at,
        members=[UserOut.model_validate(member) for member in rows.all()],
    )


@router.get("/me/teams", response_model=list[VolunteerTeamOut])
async def my_teams(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    teams = await db.scalars(
        select(VolunteerTeam)
        .join(VolunteerTeamMember, VolunteerTeamMember.team_id == VolunteerTeam.id)
        .where(VolunteerTeamMember.user_id == user.id)
        .order_by(VolunteerTeam.created_at.desc())
    )
    return [await _team_out(db, team) for team in teams.all()]


@router.post("/teams", response_model=VolunteerTeamOut, status_code=201)
async def create_team(
    body: VolunteerTeamCreateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(422, "Назва команди має містити щонайменше два символи")

    for _ in range(5):
        team = VolunteerTeam(
            name=name,
            invite_code="".join(secrets.choice(_CODE_ALPHABET) for _ in range(8)),
            created_by=user.id,
        )
        db.add(team)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            continue
        db.add(VolunteerTeamMember(team_id=team.id, user_id=user.id))
        await db.commit()
        await db.refresh(team)
        return await _team_out(db, team)

    raise HTTPException(503, "Не вдалося створити унікальний код команди. Спробуйте ще раз.")


@router.post("/teams/join", response_model=VolunteerTeamOut)
async def join_team(
    body: VolunteerTeamJoinIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    code = body.code.strip().upper()
    team = await db.scalar(select(VolunteerTeam).where(VolunteerTeam.invite_code == code))
    if team is None:
        raise HTTPException(404, "Команду з таким кодом не знайдено")

    membership = await db.scalar(
        select(VolunteerTeamMember.id).where(
            VolunteerTeamMember.team_id == team.id,
            VolunteerTeamMember.user_id == user.id,
        )
    )
    if membership is not None:
        raise HTTPException(409, "Ви вже долучилися до цієї команди")

    db.add(VolunteerTeamMember(team_id=team.id, user_id=user.id))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Ви вже долучилися до цієї команди")
    return await _team_out(db, team)
