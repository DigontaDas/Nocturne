from typing import Any
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_connect_args: dict[str, Any] = {}
_engine_kwargs: dict[str, Any] = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
}

if settings.DATABASE_URL.startswith("postgresql"):
    _connect_args["timeout"] = 30
    if "-pooler" in settings.DATABASE_URL:
        # Disable asyncpg prepared statement cache when using PgBouncer / Neon pooler
        _connect_args["statement_cache_size"] = 0
    _engine_kwargs.update(
        {
            "pool_size": 5,
            "max_overflow": 10,
            "pool_recycle": 240,
        }
    )

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    **_engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session per request."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_extensions() -> None:
    """Ensure pgvector and pg_trgm extensions exist on PostgreSQL."""
    async with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
