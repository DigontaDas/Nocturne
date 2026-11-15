import asyncio
import os
from contextlib import asynccontextmanager, suppress

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.health import health_check
from app.api.v1.router import api_router
from app.core.config import settings
from app.db.redis import create_redis_client, get_redis
from app.db.session import engine, get_db, init_extensions
from app.services.bootstrap import BOOTSTRAP_STATUS, bootstrap_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = create_redis_client()
    app.state.bootstrap_task = None

    skip_bootstrap = bool(
        os.getenv("PYTEST_CURRENT_TEST") or os.getenv("NOCTURNE_SKIP_BOOTSTRAP") == "1"
    )
    if skip_bootstrap:
        try:
            await asyncio.wait_for(init_extensions(), timeout=2.5)
        except Exception:
            pass
    else:
        app.state.bootstrap_task = asyncio.create_task(bootstrap_database(dispose_engine=False))

    yield

    task = getattr(app.state, "bootstrap_task", None)
    if task is not None and not task.done():
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

cors_origins = list(settings.CORS_ORIGINS)
frontend_origin = settings.FRONTEND_URL.strip().rstrip("/")
if frontend_origin and frontend_origin not in cors_origins:
    cors_origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https://[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": settings.APP_NAME,
        "docs": "/docs",
        "health": "/api/v1/health",
        "bootstrap": str(BOOTSTRAP_STATUS.get("state", "idle")),
    }


@app.get("/health")
async def root_health(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    """Alias root /health probe to the Postgres + Redis health check."""
    return await health_check(db=db, redis=redis)
