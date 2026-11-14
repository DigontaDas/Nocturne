"""Resilient cloud startup entrypoint for Nocturne backend."""
from __future__ import annotations

import asyncio
import os
import sys
import traceback
from pathlib import Path
from urllib.parse import urlsplit

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine, init_extensions
from app.models.entities import Base
from scripts.seed_nocturne import seed_database


def _mask_host(url: str) -> str:
    try:
        parsed = urlsplit(url)
        port_part = f":{parsed.port}" if parsed.port else ""
        return f"{parsed.scheme}://{parsed.hostname or 'unknown'}{port_part}{parsed.path}"
    except Exception:
        return "<invalid-url>"


async def _wait_for_postgres(max_attempts: int = 3) -> bool:
    """Retry PostgreSQL handshake so serverless Neon computes can wake from suspend."""
    for attempt in range(1, max_attempts + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception as exc:
            print(
                f"[start] PostgreSQL probe attempt {attempt}/{max_attempts} failed: {exc}",
                flush=True,
            )
            if attempt < max_attempts:
                await asyncio.sleep(min(6, attempt * 2))
    return False


async def _repair_unstamped_schema_if_needed() -> None:
    """If tables were created before alembic_version existed, stamp the matching revision."""
    async with engine.connect() as conn:
        def _inspect_schema(sync_conn) -> str | None:
            inspector = inspect(sync_conn)
            tables = set(inspector.get_table_names())
            has_alembic = "alembic_version" in tables
            if has_alembic:
                row = sync_conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).first()
                if row is not None:
                    return None
            if "dining_zones" not in tables or "reservations" not in tables:
                return None
            res_cols = {col["name"] for col in inspector.get_columns("reservations")}
            if "refund_amount_bdt" in res_cols:
                return "0003_cancellation_and_refund_policy"
            if "payment_status" in res_cols:
                return "0002_early_payment_fields"
            return "0001_initial_schema"

        stamp_rev = await conn.run_sync(_inspect_schema)

    if stamp_rev:
        print(f"[start] Detected pre-existing schema without alembic_version; stamping {stamp_rev}", flush=True)
        cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        await asyncio.to_thread(command.stamp, cfg, stamp_rev)


async def bootstrap_database() -> None:
    """Run Alembic migrations and idempotent seeding with clear cloud diagnostics."""
    db_host = _mask_host(settings.DATABASE_URL)
    redis_host = _mask_host(settings.REDIS_URL)
    print(f"[start] Database target: {db_host}", flush=True)
    print(f"[start] Redis target:    {redis_host}", flush=True)

    try:
        in_cloud = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))
        parsed_db = urlsplit(settings.DATABASE_URL)
        if in_cloud and parsed_db.hostname in {"localhost", "127.0.0.1", "::1"}:
            print(
                "[start] WARNING: DATABASE_URL points to localhost inside Railway container. "
                "Set DATABASE_URL in Railway Variables (e.g. your Neon postgresql+asyncpg:// URL). "
                "Skipping startup migrations and starting API in degraded mode.",
                flush=True,
            )
            return

        if not await _wait_for_postgres(max_attempts=3):
            print(
                "[start] WARNING: PostgreSQL unreachable after retries; starting API so /health stays responsive.",
                flush=True,
            )
            return

        try:
            await _repair_unstamped_schema_if_needed()
            cfg = Config(str(BACKEND_DIR / "alembic.ini"))
            cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
            await asyncio.to_thread(command.upgrade, cfg, "head")
            print("[start] Alembic migrations up to date.", flush=True)
        except Exception:
            print(
                "[start] Alembic upgrade failed; ensuring ORM metadata and extensions:",
                flush=True,
            )
            traceback.print_exc()
            await init_extensions()
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

        await init_extensions()
        async with AsyncSessionLocal() as db:
            counts = await seed_database(db)
        print(f"[start] Seed verified: {counts}", flush=True)
    except Exception:
        print("[start] WARNING: Database initialization encountered an error:", flush=True)
        traceback.print_exc()
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(bootstrap_database())
    port = int(os.getenv("PORT", "8000"))
    print(f"[start] Launching Uvicorn on 0.0.0.0:{port}", flush=True)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
