from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Role:
    USER = "user"
    MODERATOR = "moderator"  # модератор приложения: заявки организаций и партнеров, опасные квесты, споры


class OrgRole:
    MEMBER = "member"
    MODERATOR = "moderator"  # модератор организации; глава — модератор всегда


class QuestStatus:
    AI_PROCESSING = "ai_processing"                # заявка создана, ждет AI
    PENDING_MODERATION = "pending_moderation"      # AI отработал (или упал), ждет модератора организации
    AVAILABLE = "available"                        # опубликован, можно взять
    BLOCKED = "blocked"                            # заблокирован модератором
    IN_PROGRESS = "in_progress"                    # взят; команда собирается / выполняет
    PENDING_VERIFICATION = "pending_verification"  # фото выполнения на проверке
    COMPLETED = "completed"

    REVIEW = (AI_PROCESSING, PENDING_MODERATION)
    PUBLIC = (AVAILABLE, IN_PROGRESS, PENDING_VERIFICATION, COMPLETED)


class ClaimMode:
    SOLO = "solo"
    TEAM = "team"
    ORGANIZATION = "organization"


class ParticipantStatus:
    INVITED = "invited"
    CONFIRMED = "confirmed"
    DECLINED = "declined"


class SubmissionStatus:
    AI_REVIEW = "ai_review"              # AI оценивает (первично или после аргумента организации)
    ORG_REVIEW = "org_review"            # ход модератора организации: спорить с AI или решить
    PLATFORM_REVIEW = "platform_review"  # спорное решение организации с низким доверием ждет модератора приложения
    APPROVED = "approved"                # итоговый % >= PASS_PERCENT, XP начислены
    REJECTED = "rejected"                # итоговый % < PASS_PERCENT, квест снова in_progress

    REVIEW = (AI_REVIEW, ORG_REVIEW, PLATFORM_REVIEW)
    DECIDED = (APPROVED, REJECTED, PLATFORM_REVIEW)  # организация уже вынесла решение


class OrgStatus:
    """Статус заявки организации или партнера."""
    PENDING = "pending"    # заявка ждет модератора приложения
    APPROVED = "approved"
    REJECTED = "rejected"


class ReportStatus:
    OPEN = "open"            # метка жителя на карте, ждет организацию
    CONVERTED = "converted"  # организация сделала из нее квест


def _now():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Вход через Google и/или по email+паролю; хотя бы одно из двух.
    google_sub: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(16), default=Role.USER)
    created_at: Mapped[datetime] = _now()


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)  # sha256, сам токен не храним
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    logo_url: Mapped[Optional[str]] = mapped_column(String(512))
    head_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # главный аккаунт
    status: Mapped[str] = mapped_column(String(16), default=OrgStatus.PENDING, index=True)
    moderator_note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), default=OrgRole.MEMBER)  # назначает глава
    joined_at: Mapped[datetime] = _now()


class VolunteerTeam(Base):
    __tablename__ = "volunteer_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    invite_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = _now()


class VolunteerTeamMember(Base):
    __tablename__ = "volunteer_team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_volunteer_team_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("volunteer_teams.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    joined_at: Mapped[datetime] = _now()


class Report(Base):
    """Активность жителя: фото + точка. Квест из нее делает организация."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    photo_url: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(16), default=ReportStatus.OPEN, index=True)
    organization_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organizations.id"))  # кто забрал
    reviewer_type: Mapped[str] = mapped_column(String(8), default="ai", server_default="ai")
    review_status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    review_score: Mapped[Optional[int]] = mapped_column(Integer)
    review_approved: Mapped[Optional[bool]] = mapped_column(Boolean)
    review_note: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Квест ищется по quests.report_id (обратный FK дал бы цикл между таблицами).
    created_at: Mapped[datetime] = _now()


class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # Организация-владелец: создала квест, публикует его и проверяет выполнение.
    owner_org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    report_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reports.id"))  # из какой метки
    title: Mapped[Optional[str]] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    photo_url: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default=QuestStatus.AI_PROCESSING, index=True)
    difficulty: Mapped[Optional[int]] = mapped_column(Integer)
    reward_xp: Mapped[Optional[int]] = mapped_column(Integer)
    ai_result: Mapped[Optional[dict]] = mapped_column(JSON)  # предложение AI для модератора
    moderator_note: Mapped[Optional[str]] = mapped_column(Text)  # причина блокировки
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Один активный ответственный на квест (MVP).
    executor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    mode: Mapped[Optional[str]] = mapped_column(String(16))  # solo / team / organization
    # От имени какой организации выполняют (ей орг-очки). Не путать с owner_org_id.
    organization_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organizations.id"), index=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()


class QuestParticipant(Base):
    """Состав исполнителей. Ответственный добавляется сразу как confirmed."""

    __tablename__ = "quest_participants"
    __table_args__ = (UniqueConstraint("quest_id", "user_id", name="uq_quest_participant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=ParticipantStatus.INVITED)
    invited_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _now()


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    photo_url: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default=SubmissionStatus.AI_REVIEW, index=True)
    ai_result: Mapped[Optional[dict]] = mapped_column(JSON)  # первичная проверка AI
    ai_failed: Mapped[bool] = mapped_column(Boolean, default=False)  # AI упал — организация решает вручную
    ai_percent: Mapped[Optional[int]] = mapped_column(Integer)  # последняя оценка AI в чате
    org_rounds: Mapped[int] = mapped_column(Integer, default=0)  # сколько раз организация оспорила оценку
    ai_revisions: Mapped[int] = mapped_column(Integer, default=0)  # сколько раз AI поменял оценку
    org_percent: Mapped[Optional[int]] = mapped_column(Integer)  # решение организации
    final_percent: Mapped[Optional[int]] = mapped_column(Integer)  # итог (организация или модератор приложения)
    awarded_xp: Mapped[Optional[int]] = mapped_column(Integer)  # XP каждому confirmed участнику
    disputed: Mapped[bool] = mapped_column(Boolean, default=False)  # решение организации расходится с AI
    decided_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))  # None — итог за AI
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    moderator_note: Mapped[Optional[str]] = mapped_column(Text)  # итоговый комментарий, видит исполнитель
    created_at: Mapped[datetime] = _now()


class ReviewMessage(Base):
    """Чат оценки выполнения между AI и модераторами организации. Исполнитель его не видит."""

    __tablename__ = "review_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    author: Mapped[str] = mapped_column(String(16))  # ai / org / platform
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    percent: Mapped[Optional[int]] = mapped_column(Integer)  # None — AI недоступен
    text: Mapped[Optional[str]] = mapped_column(Text)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)  # решение, а не аргумент
    created_at: Mapped[datetime] = _now()


class ModerationAction(Base):
    """Журнал решений модераторов (приложения и организаций): кто, когда, что было и что стало."""

    __tablename__ = "moderation_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_type: Mapped[str] = mapped_column(String(16))  # quest / submission / organization / partner
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    moderator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))  # None — решение AI
    action: Mapped[str] = mapped_column(String(16))  # edit / publish / block / approve / reject
    reason: Mapped[Optional[str]] = mapped_column(Text)
    before_json: Mapped[Optional[dict]] = mapped_column(JSON)
    after_json: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = _now()


class XpLedger(Base):
    """Единственный источник правды по личным XP. Баланс = сумма delta."""

    __tablename__ = "xp_ledger"
    __table_args__ = (
        # Одна награда пользователю за квест, даже при повторном вызове.
        UniqueConstraint("user_id", "quest_id", "kind", name="uq_xp_reward"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)  # + заработано, - потрачено
    kind: Mapped[str] = mapped_column(String(32))  # quest_reward / redemption
    quest_id: Mapped[Optional[int]] = mapped_column(ForeignKey("quests.id"))
    redemption_id: Mapped[Optional[int]] = mapped_column(ForeignKey("redemptions.id"))
    created_at: Mapped[datetime] = _now()


class OrgLedger(Base):
    """Организационные очки — отдельная метрика, не сумма личных XP участников."""

    __tablename__ = "org_ledger"
    __table_args__ = (UniqueConstraint("organization_id", "quest_id", "kind", name="uq_org_reward"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32))  # quest_reward
    quest_id: Mapped[Optional[int]] = mapped_column(ForeignKey("quests.id"))
    created_at: Mapped[datetime] = _now()


class Partner(Base):
    """Партнер (кафе, прокат...). Создается по заявке, одобряет модератор приложения.
    Глава партнера сам заводит награды и промокоды."""

    __tablename__ = "partners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    logo_url: Mapped[Optional[str]] = mapped_column(String(512))
    head_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=OrgStatus.PENDING, index=True)
    moderator_note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()


class Reward(Base):
    __tablename__ = "rewards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("partners.id"), index=True)
    partner_name: Mapped[str] = mapped_column(String(255))  # копия названия для витрины
    title: Mapped[str] = mapped_column(String(255))
    terms: Mapped[Optional[str]] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(String(512))
    cost_xp: Mapped[int] = mapped_column(Integer)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(default=True)


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reward_id: Mapped[int] = mapped_column(ForeignKey("rewards.id"), index=True)
    code: Mapped[str] = mapped_column(String(128), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="available", index=True)  # available / issued
    issued_to: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Redemption(Base):
    __tablename__ = "redemptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reward_id: Mapped[int] = mapped_column(ForeignKey("rewards.id"))
    promo_code_id: Mapped[int] = mapped_column(ForeignKey("promo_codes.id"), unique=True)
    spent_xp: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = _now()
