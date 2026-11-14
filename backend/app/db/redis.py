from fastapi import Request
from redis.asyncio import Redis

from app.core.config import settings


def create_redis_client() -> Redis:
    """Create an async Redis client configured with bounded socket timeouts."""
    return Redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


async def get_redis(request: Request) -> Redis:
    """Retrieve the shared async Redis client from FastAPI app state."""
    return request.app.state.redis
