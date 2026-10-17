from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- users / auth ----------

class UserOut(ORM):
    id: int
    name: str
    avatar_url: Optional[str] = None


class MeOut(UserOut):
    email: Optional[str] = None
    role: str
    has_password: bool
    has_google: bool
    lifetime_xp: int
    spendable_xp: int
    level: int
    created_count: int
    completed_count: int
    moderated_org_ids: list[int] = []  # где я модератор организации: показываем панель организации


class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=64)


class LoginIn(BaseModel):
    email: str
    password: str


class GoogleLoginIn(BaseModel):
    id_token: str


class DevLoginIn(BaseModel):
    name: str


class ForgotPasswordIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- quests ----------

class QuestOut(ORM):
    id: int
    title: Optional[str] = None
    description: Optional[str] = None
    lat: float
    lng: float
    photo_url: str
    status: str
    difficulty: Optional[int] = None
    reward_xp: Optional[int] = None
    created_by: int
    owner_org_id: int  # организация-владелец: публикует и проверяет выполнение
    report_id: Optional[int] = None
    executor_id: Optional[int] = None
    mode: Optional[str] = None
    organization_id: Optional[int] = None
    created_at: datetime
    distance_km: Optional[float] = None  # только при поиске «рядом» (near=lat,lng)


class ParticipantOut(BaseModel):
    user: UserOut
    status: str


class QuestActions(BaseModel):
    can_claim: bool
    can_invite: bool    # ответственный командного/орг квеста, пока квест in_progress
    can_respond: bool   # меня пригласили, и состав еще не зафиксирован
    can_submit: bool    # только ответственный
    can_abandon: bool = False  # ответственный может отказаться, пока отчет не отправлен


class SubmissionOut(ORM):
    """Для исполнителя: только итог. Чат AI и организации ему не показывается."""
    id: int
    quest_id: int
    photo_url: str
    status: str  # ai_review / org_review / platform_review — «на проверке»; approved / rejected
    final_percent: Optional[int] = None
    awarded_xp: Optional[int] = None
    moderator_note: Optional[str] = None  # итоговый комментарий
    created_at: datetime


class QuestDetailOut(QuestOut):
    ai_reason: Optional[str] = None
    moderator_note: Optional[str] = None
    author: Optional[UserOut] = None
    executor: Optional[UserOut] = None
    owner_org_name: Optional[str] = None
    organization_name: Optional[str] = None
    participants: list[ParticipantOut] = []
    my_participation: Optional[str] = None
    last_submission: Optional[SubmissionOut] = None
    actions: QuestActions


class ClaimIn(BaseModel):
    mode: Literal["solo", "team", "organization"] = "solo"
    organization_id: Optional[int] = None  # обязательно для mode=organization


class InviteIn(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None


class RespondIn(BaseModel):
    accept: bool


class InvitationOut(BaseModel):
    quest: QuestOut
    invited_by: Optional[UserOut] = None
    status: str


# ---------- moderation ----------

class ActionOut(ORM):
    id: int
    target_type: str
    target_id: int
    moderator_id: Optional[int] = None  # None — решение принял AI
    action: str
    reason: Optional[str] = None
    before_json: Optional[dict] = None
    after_json: Optional[dict] = None
    created_at: datetime


class ModQuestOut(QuestOut):
    ai_result: Optional[dict] = None
    moderator_note: Optional[str] = None
    author: Optional[UserOut] = None
    hazard: bool = False  # AI отметил опасность: публикует только модератор приложения


class ModQuestDetailOut(ModQuestOut):
    history: list[ActionOut] = []


class QuestEditIn(BaseModel):
    title: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    difficulty: Optional[int] = Field(None, ge=1, le=5)  # без reward_xp пересчитает XP по таблице
    reward_xp: Optional[int] = Field(None, ge=0, le=5000)


class ReasonIn(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


class BlockIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)  # видна автору


class ReviewMessageOut(ORM):
    id: int
    author: str  # ai / org / platform
    user: Optional[UserOut] = None
    percent: Optional[int] = None  # None — AI недоступен
    text: Optional[str] = None
    is_final: bool
    created_at: datetime


class ReviewSubmissionOut(SubmissionOut):
    """Для модераторов: отчет + чат оценки + счетчики правок."""
    quest: QuestOut  # фото «до» для сравнения
    executor: Optional[UserOut] = None
    ai_failed: bool
    ai_percent: Optional[int] = None
    org_percent: Optional[int] = None
    org_rounds: int
    rounds_left: int
    ai_revisions: int
    disputed: bool
    messages: list[ReviewMessageOut] = []
    can_review: bool = False  # я модератор организации и не участвовал в выполнении


class ArgueIn(BaseModel):
    percent: int = Field(ge=0, le=100)
    text: str = Field(min_length=1, max_length=1000)  # аргумент для AI


class PercentDecisionIn(BaseModel):
    percent: int = Field(ge=0, le=100)  # < PASS_PERCENT — отказ
    note: Optional[str] = Field(None, max_length=500)  # итоговый комментарий, видит исполнитель


class DecisionIn(BaseModel):
    approved: bool
    note: Optional[str] = Field(None, max_length=500)  # причина, видна заявителю


class TrustOut(BaseModel):
    decisions: int        # решений организации в окне TRUST_WINDOW
    disputed: int         # из них разошлись с AI
    disputed_ratio: float
    under_review: bool    # спорные решения ждут модератора приложения


# ---------- organizations ----------

class OrgCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    logo_url: Optional[str] = Field(None, max_length=512)


class OrgOut(ORM):
    id: int
    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    head_id: int
    status: str
    moderator_note: Optional[str] = None
    created_at: datetime
    points: int = 0  # организационные очки (отдельно от личных XP)


class MemberOut(UserOut):
    role: str  # member / moderator (глава — всегда moderator)


class OrgDetailOut(OrgOut):
    head: Optional[UserOut] = None
    members: list[MemberOut] = []
    completed_quests: int = 0
    is_head: bool = False
    is_member: bool = False
    is_moderator: bool = False
    trust: TrustOut


class MemberIn(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None


class MemberRoleIn(BaseModel):
    role: Literal["member", "moderator"]


class OrgTrustOut(BaseModel):
    organization: OrgOut
    trust: TrustOut


# ---------- reports (метки жителей) ----------

class ReportOut(ORM):
    id: int
    created_by: int
    description: Optional[str] = None
    lat: float
    lng: float
    photo_url: str
    status: str  # open / converted
    organization_id: Optional[int] = None
    reviewer_type: Literal["self", "ai"] = "ai"
    review_status: Literal["pending", "evaluated", "failed"] = "pending"
    review_score: Optional[int] = None
    review_approved: Optional[bool] = None
    review_note: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime


class ReportReviewIn(BaseModel):
    score: int = Field(ge=1, le=5)
    note: Optional[str] = Field(None, max_length=500)


class ReportToQuestIn(BaseModel):
    organization_id: int
    title: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)


class VolunteerTeamCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class VolunteerTeamJoinIn(BaseModel):
    code: str = Field(min_length=6, max_length=12)


class VolunteerTeamOut(ORM):
    id: int
    name: str
    invite_code: str
    created_by: int
    created_at: datetime
    members: list[UserOut] = []


# ---------- partners ----------

class PartnerCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    logo_url: Optional[str] = Field(None, max_length=512)


class PartnerOut(ORM):
    id: int
    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    head_id: int
    status: str
    moderator_note: Optional[str] = None
    created_at: datetime


class RewardIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    terms: Optional[str] = Field(None, max_length=2000)
    image_url: Optional[str] = Field(None, max_length=512)
    cost_xp: int = Field(ge=1, le=100000)
    valid_until: Optional[datetime] = None


class RewardEditIn(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    terms: Optional[str] = Field(None, max_length=2000)
    image_url: Optional[str] = Field(None, max_length=512)
    cost_xp: Optional[int] = Field(None, ge=1, le=100000)
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None


class CodesIn(BaseModel):
    codes: list[str] = Field(min_length=1, max_length=1000)


# ---------- rewards ----------

class RewardOut(ORM):
    id: int
    partner_id: int
    partner_name: str
    title: str
    terms: Optional[str] = None
    image_url: Optional[str] = None
    cost_xp: int
    valid_until: Optional[datetime] = None
    is_active: bool = True
    available: int = 0


class RedemptionOut(BaseModel):
    id: int
    reward: RewardOut
    code: str
    spent_xp: int
    created_at: datetime


class LeaderOut(BaseModel):
    user: UserOut
    lifetime_xp: int
    level: int


class OrgLeaderOut(BaseModel):
    organization: OrgOut
    points: int


# ---------- statistics ----------

class WeekOut(BaseModel):
    week_start: datetime        # понедельник недели (UTC)
    places_cleaned: int         # квестов закрыто за неделю
    reports: int                # новых меток жителей


class PlatformStatsOut(BaseModel):
    """Публичная витрина: показывает новым пользователям, что платформа живая."""
    places_cleaned: int         # выполненных квестов (completed)
    quests_available: int       # сейчас можно взять
    quests_in_progress: int
    reports_total: int          # меток жителей
    reports_converted: int      # из них стали квестами
    volunteers: int             # пользователей, получивших хоть раз XP
    organizations: int          # одобренных
    partners: int               # одобренных
    xp_awarded: int             # всего начислено XP
    promo_codes_issued: int
    avg_completion_percent: Optional[float] = None  # средний итоговый % зачтенных отчетов
    ai_agreement: Optional[float] = None            # доля решений организаций, согласных с AI
    weeks: list[WeekOut] = []   # последние 8 недель, старые первыми


class UserStatsOut(BaseModel):
    """Профиль игрока: прогресс и репутация. Только показывается, на правила не влияет."""
    user: UserOut
    lifetime_xp: int
    level: int
    level_progress_xp: int      # XP внутри текущего уровня
    xp_per_level: int
    quests_completed: int       # как подтвержденный участник
    submissions_approved: int   # отчеты, которые я отправил как ответственный
    submissions_rejected: int
    reliability: Optional[float] = None  # approved / (approved + rejected)
    avg_completion_percent: Optional[float] = None
    reports_created: int
    reports_converted: int      # мои метки, ставшие квестами
    organizations: int


class OrgStatsOut(BaseModel):
    organization: OrgOut
    points: int
    members: int
    quests_created: int          # квесты организации (owner)
    quests_published: int        # дошли до карты
    quests_completed_owned: int  # ее квесты выполнены
    quests_completed_as_executor: int  # выполнены от ее имени
    reports_converted: int       # метки жителей, которые она забрала
    avg_completion_percent: Optional[float] = None  # по ее квестам
    trust: TrustOut


# ---------- «Доказ добра»: мапа змін и портфолио ----------

class ImpactOut(BaseModel):
    """Выполненный квест как доказательство: фото до/после, итоговый %, кто сделал."""
    quest_id: int
    title: Optional[str] = None
    lat: float
    lng: float
    difficulty: Optional[int] = None
    photo_before_url: str        # фото квеста
    photo_after_url: str         # фото зачтенного отчета
    final_percent: int
    completed_at: Optional[datetime] = None
    owner_org_name: Optional[str] = None      # чей квест (проверяла эта организация)
    executor_org_name: Optional[str] = None   # от имени какой организации выполняли
    team: list[UserOut] = []                  # подтвержденные участники


class PortfolioItemOut(ImpactOut):
    awarded_xp: int              # сколько получил этот волонтер


class PortfolioOut(BaseModel):
    """Публичное портфолио волонтера: доступно по ссылке без входа."""
    stats: UserStatsOut
    items: list[PortfolioItemOut] = []   # новые первыми


class PartnerRewardStatsOut(BaseModel):
    reward_id: int
    title: str
    cost_xp: int
    is_active: bool
    codes_total: int
    codes_issued: int
    codes_available: int


class PartnerStatsOut(BaseModel):
    """Отдача для спонсора: сколько наград выдано и сколько людей пришло."""
    partner: PartnerOut
    rewards_active: int
    codes_total: int
    codes_issued: int
    codes_available: int
    unique_users: int          # разных пользователей получили коды
    xp_spent: int              # сколько XP волонтеры потратили на награды партнера
    issued_last_7_days: int
    rewards: list[PartnerRewardStatsOut] = []
