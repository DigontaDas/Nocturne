import asyncio

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis
from app.db.session import get_db

router = APIRouter(tags=["health"])


async def _check_postgres(db: AsyncSession) -> str:
    try:
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=1.5)
        return "up"
    except Exception:
        return "down"


async def _check_redis(redis: Redis) -> str:
    try:
        pong = await asyncio.wait_for(redis.ping(), timeout=1.5)
        return "up" if pong else "down"
    except Exception:
        return "down"


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    """Verify PostgreSQL and Redis liveness concurrently within a bounded 1.5s budget."""
    db_status, redis_status = await asyncio.gather(
        _check_postgres(db),
        _check_redis(redis),
    )

    return {
        "status": "ok" if db_status == "up" and redis_status == "up" else "degraded",
        "postgres": db_status,
        "redis": redis_status,
    }
