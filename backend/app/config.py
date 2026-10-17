import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


DATABASE_URL = os.getenv("DATABASE_URL", "")
SQL_ECHO = _bool("SQL_ECHO")

# Auth
# Через запятую: Web, Android и iOS клиенты из Google Cloud Console. В React Native ID-токен
# может быть выписан на любой из них (aud), принимаем все перечисленные.
GOOGLE_CLIENT_IDS = [c.strip() for c in os.getenv("GOOGLE_CLIENT_ID", "").split(",") if c.strip()]
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "72"))
# POST /auth/dev: вход по одному имени. Для разработки и демо-аккаунтов.
DEV_LOGIN = _bool("DEV_LOGIN")
# Эти email получают роль модератора приложения при входе/регистрации.
MODERATOR_EMAILS = {e.strip().lower() for e in os.getenv("MODERATOR_EMAILS", "").split(",") if e.strip()}

# Проверка выполнения: AI ставит % выполнения, модератор организации может оспорить его
# не больше MAX_REVIEW_ROUNDS раз (AI каждый раз пересматривает), последнее слово — за организацией.
MAX_REVIEW_ROUNDS = int(os.getenv("MAX_REVIEW_ROUNDS", "3"))
PASS_PERCENT = int(os.getenv("PASS_PERCENT", "30"))  # ниже — отчет отклонен, квест снова in_progress
# Решение организации спорное, если расходится с последней оценкой AI больше чем на DISPUTE_DELTA п.п.
# или дает другой вердикт (зачет/отказ).
DISPUTE_DELTA = int(os.getenv("DISPUTE_DELTA", "30"))
# Доверие: если среди последних TRUST_WINDOW решений организации доля спорных больше TRUST_THRESHOLD
# (и решений не меньше TRUST_MIN_DECISIONS), новое спорное решение ждет модератора приложения.
TRUST_WINDOW = int(os.getenv("TRUST_WINDOW", "10"))
TRUST_THRESHOLD = float(os.getenv("TRUST_THRESHOLD", "0.4"))
TRUST_MIN_DECISIONS = int(os.getenv("TRUST_MIN_DECISIONS", "5"))

# Почта (SMTP). Без SMTP_HOST письма не уходят, а пишутся в лог.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))  # 587 — STARTTLS, 465 — SSL
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER

# Сброс пароля: токен живет столько минут. RESET_URL — ссылка на страницу фронта с {token},
# например https://ecoquest.example/reset-password?token={token}. Пусто — в письме будет сам код.
RESET_TOKEN_MINUTES = int(os.getenv("RESET_TOKEN_MINUTES", "60"))
RESET_URL = os.getenv("RESET_URL", "")

# AI: "gemini" — настоящая проверка, "mock" — всегда одобряет (демо без интернета).
AI_MODE = os.getenv("AI_MODE", "mock")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
# Если основная модель перегружена (503/429) — пробуем эту. Пусто — без запасной.
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")
AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "30"))

# Photos
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
MAX_PHOTO_MB = int(os.getenv("MAX_PHOTO_MB", "8"))

# Через запятую. "*" — разрешить всё (удобно на хакатоне).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# XP за сложность 1..5
REWARD_TABLE = {1: 50, 2: 100, 3: 150, 4: 250, 5: 400}
XP_PER_LEVEL = 500

if not DATABASE_URL:
    raise RuntimeError(f"DATABASE_URL не задан (см. {BASE_DIR / '.env.example'})")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET не задан")
