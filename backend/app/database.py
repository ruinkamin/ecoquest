from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from . import config


def _async_url(url: str) -> str:
    """postgresql://... (как дает Neon) -> postgresql+asyncpg://... без libpq-параметров."""
    parsed = urlparse(url)
    if parsed.scheme not in ("postgresql", "postgres"):
        return url  # например sqlite+aiosqlite:///./dev.db для локальной проверки
    query = parse_qs(parsed.query)
    for param in ("channel_binding", "sslmode", "gssencmode", "target_session_attrs"):
        query.pop(param, None)
    if "localhost" not in parsed.netloc and "127.0.0.1" not in parsed.netloc:
        query["ssl"] = ["require"]
    return urlunparse(parsed._replace(scheme="postgresql+asyncpg", query=urlencode(query, doseq=True)))


engine = create_async_engine(_async_url(config.DATABASE_URL), echo=config.SQL_ECHO, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session


async def init_db():
    from . import models  # импорт регистрирует таблицы в Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

        def add_report_review_columns(sync_conn):
            columns = {column["name"] for column in inspect(sync_conn).get_columns("reports")}
            new_columns = {
                "reviewer_type": "VARCHAR(8) NOT NULL DEFAULT 'ai'",
                "review_status": "VARCHAR(16) NOT NULL DEFAULT 'pending'",
                "review_score": "INTEGER",
                "review_approved": "BOOLEAN",
                "review_note": "TEXT",
                "reviewed_at": "TIMESTAMP WITH TIME ZONE",
            }
            for name, sql_type in new_columns.items():
                if name not in columns:
                    sync_conn.execute(text(f"ALTER TABLE reports ADD COLUMN {name} {sql_type}"))

        await conn.run_sync(add_report_review_columns)
