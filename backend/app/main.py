import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.redis import create_redis_client
from app.db.session import engine, init_extensions


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = create_redis_client()
    try:
        await asyncio.wait_for(init_extensions(), timeout=2.5)
    except Exception:
        # Allow app startup even if DB is temporarily unreachable until healthcheck
        pass
    yield
    await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": settings.APP_NAME, "docs": "/docs", "health": "/api/v1/health"}
