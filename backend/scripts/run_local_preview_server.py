"""Run the Nocturne API in Docker-free local preview mode (SQLite + FakeRedis).

Use this when Docker Desktop / PostgreSQL+pgvector is not running yet and you
want to preview and interact with the full frontend locally.
"""
from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

import fakeredis.aioredis
import uvicorn
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.redis import get_redis  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from scripts.seed_nocturne import seed_database  # noqa: E402


@asynccontextmanager
async def _preview_lifespan(target_app: FastAPI):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

    async with session_factory() as seed_session:
        counts = await seed_database(seed_session)
    print(f"[Nocturne Preview API] Seeded local preview store: {counts}", flush=True)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    async def override_get_redis():
        return fake_redis

    target_app.state.redis = fake_redis
    target_app.dependency_overrides[get_db] = override_get_db
    target_app.dependency_overrides[get_redis] = override_get_redis
    try:
        yield
    finally:
        target_app.dependency_overrides.clear()
        await fake_redis.aclose()
        await engine.dispose()


def main() -> None:
    app.router.lifespan_context = _preview_lifespan
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
