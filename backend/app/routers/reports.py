"""Активности жителей: фото + точка. Одобренная организация может сделать из активности квест."""
import logging
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import ai, storage
from ..auth import current_user
from ..database import SessionLocal, get_db
from ..models import Report, ReportStatus, User
from ..schemas import QuestOut, ReportOut, ReportReviewIn, ReportToQuestIn
from .quests import create_quest_record, require_org_moderator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["reports"])


async def run_report_review(report_id: int) -> None:
    async with SessionLocal() as db:
        report = await db.get(Report, report_id)
        if report is None or report.reviewer_type != "ai" or report.review_status != "pending":
            return
        photo = storage.load_photo(report.photo_url)
        if photo is None:
            report.review_status = "failed"
            report.review_note = "Фото недоступне для автоматичної оцінки."
            await db.commit()
            return
        try:
            result = await ai.check_quest(photo, report.description or "")
        except Exception:
            logger.exception("AI assessment failed for activity %s", report_id)
            report.review_status = "failed"
            report.review_note = "Не вдалося оцінити автоматично. Спробуйте ще раз."
        else:
            report.review_status = "evaluated"
            report.review_approved = bool(result["approved"])
            report.review_note = str(result.get("reason") or "")[:500] or None
        report.reviewed_at = datetime.now(timezone.utc)
        await db.commit()


@router.post("", response_model=ReportOut, status_code=201)
async def create_report(
    background: BackgroundTasks,
    photo: UploadFile = File(...),
    lat: float = Form(..., ge=-90, le=90),
    lng: float = Form(..., ge=-180, le=180),
    description: Optional[str] = Form(None, max_length=1000),
    reviewer_type: Literal["self", "ai"] = Form("ai"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """multipart/form-data. Житель создаёт активность и выбирает способ её оценки."""
    photo_url = await storage.save_photo(photo)
    report = Report(
        created_by=user.id,
        lat=lat,
        lng=lng,
        photo_url=photo_url,
        description=description or None,
        reviewer_type=reviewer_type,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    if reviewer_type == "ai":
        background.add_task(run_report_review, report.id)
    return report


@router.post("/{report_id}/evaluate", response_model=ReportOut)
async def evaluate_report(
    report_id: int,
    body: ReportReviewIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(Report, report_id)
    if report is None or report.created_by != user.id:
        raise HTTPException(404, "Активність не знайдена")
    if report.reviewer_type != "self":
        raise HTTPException(409, "Для цієї активності оцінювання призначене AI")
    if report.review_status != "pending":
        raise HTTPException(409, "Активність уже оцінена")
    report.review_score = body.score
    report.review_note = body.note.strip() if body.note and body.note.strip() else None
    report.review_status = "evaluated"
    report.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(report)
    return report


@router.post("/{report_id}/retry-review", response_model=ReportOut)
async def retry_report_review(
    report_id: int,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(Report, report_id)
    if report is None or report.created_by != user.id:
        raise HTTPException(404, "Активність не знайдена")
    if report.reviewer_type != "ai" or report.review_status != "failed":
        raise HTTPException(409, "Повторна оцінка недоступна")
    report.review_status = "pending"
    report.review_note = None
    report.review_approved = None
    report.reviewed_at = None
    await db.commit()
    await db.refresh(report)
    background.add_task(run_report_review, report.id)
    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(
    bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat"),
    status: Literal["open", "converted", "all"] = "open",
    limit: int = Query(200, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = select(Report)
    if status != "all":
        q = q.where(Report.status == status)
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = map(float, bbox.split(","))
        except ValueError:
            raise HTTPException(422, "bbox: minLng,minLat,maxLng,maxLat")
        q = q.where(Report.lng.between(min_lng, max_lng), Report.lat.between(min_lat, max_lat))
    return (await db.scalars(q.order_by(Report.created_at.desc()).limit(limit))).all()


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: int, db: AsyncSession = Depends(get_db)):
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(404, "Метка не найдена")
    return report


@router.post("/{report_id}/quest", response_model=QuestOut, status_code=201)
async def report_to_quest(report_id: int, body: ReportToQuestIn, background: BackgroundTasks,
                          user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Модератор организации делает из метки квест (фото и точка берутся из метки, дальше — AI-оценка)."""
    await require_org_moderator(db, body.organization_id, user)
    user_id = user.id  # после rollback объекты сессии expired, читать их нельзя
    res = await db.execute(
        update(Report).where(Report.id == report_id, Report.status == ReportStatus.OPEN)
        .values(status=ReportStatus.CONVERTED, organization_id=body.organization_id)
    )
    if res.rowcount != 1:
        await db.rollback()
        if await db.get(Report, report_id) is None:
            raise HTTPException(404, "Метка не найдена")
        raise HTTPException(409, "Метку уже забрала организация")
    report = await db.get(Report, report_id)
    return await create_quest_record(
        db, background, user_id=user_id, org_id=body.organization_id, photo_url=report.photo_url,
        lat=report.lat, lng=report.lng, description=body.description or report.description, title=body.title,
        report_id=report_id,
    )
