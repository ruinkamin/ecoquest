import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .database import init_db
from .routers import auth, impact, me, moderation, org_moderation, organizations, partners, quests, reports, rewards, stats, teams

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Для хакатона без Alembic: создаем недостающие таблицы при старте.
    await init_db()
    yield


app = FastAPI(title="EcoQuest Dnipro API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials="*" not in config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")

for r in (auth.router, quests.router, reports.router, me.router, organizations.router, org_moderation.router,
          partners.router, rewards.router, moderation.router, stats.router, impact.router, teams.router):
    app.include_router(r)


@app.get("/health", tags=["meta"])
async def health():
    return {"ok": True, "ai_mode": config.AI_MODE,
            "review": {"max_rounds": config.MAX_REVIEW_ROUNDS, "pass_percent": config.PASS_PERCENT}}
