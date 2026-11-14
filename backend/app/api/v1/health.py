import asyncio

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis
from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    """Verify PostgreSQL and Redis liveness with bounded 1.5s probes."""
    db_status = "down"
    redis_status = "down"
    try:
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=1.5)
        db_status = "up"
    except Exception:
        db_status = "down"

    try:
        pong = await asyncio.wait_for(redis.ping(), timeout=1.5)
        redis_status = "up" if pong else "down"
    except Exception:
        redis_status = "down"

    return {
        "status": "ok" if db_status == "up" and redis_status == "up" else "degraded",
        "postgres": db_status,
        "redis": redis_status,
    }
