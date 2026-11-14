from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models import Base
from scripts.seed_nocturne import seed_database


@pytest_asyncio.fixture
async def test_env():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
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
        # Verify idempotent re-run does not duplicate rows
        counts_again = await seed_database(seed_session)
        assert counts == counts_again

    async def override_get_db():
        async with session_factory() as session:
            yield session

    async def override_get_redis():
        return fake_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, counts

    app.dependency_overrides.clear()
    await fake_redis.aclose()
    await engine.dispose()


@pytest.mark.asyncio
async def test_seed_counts_and_catalog_endpoints(test_env):
    client, counts = test_env
    assert counts["zones"] == 3
    assert counts["tables"] == 18
    assert counts["menu_items"] == 12
    assert counts["knowledge_chunks"] >= 8

    today_str = date.today().isoformat()

    zones_resp = await client.get(f"/api/v1/zones?date={today_str}&time_slot=20:30")
    assert zones_resp.status_code == 200
    zones = zones_resp.json()
    assert [z["slug"] for z in zones] == ["rooftop", "main-hall", "private-lounge"]
    assert sum(z["table_count"] for z in zones) == 18

    public_dir = BACKEND_DIR.parent / "frontend" / "public"
    for zone in zones:
        assert zone["preview_image_url"].startswith("/media/")
        assert zone["preview_video_url"].startswith("/media/")
        assert (public_dir / zone["preview_image_url"].lstrip("/")).is_file()
        assert (public_dir / zone["preview_video_url"].lstrip("/")).is_file()

    tables_resp = await client.get(f"/api/v1/tables?date={today_str}&time_slot=20:30")
    assert tables_resp.status_code == 200
    tables = tables_resp.json()
    assert len(tables) == 18
    for table in tables:
        assert table["perspective_photo_url"].startswith("/media/")
        assert (public_dir / table["perspective_photo_url"].lstrip("/")).is_file()
    by_code = {t["table_code"]: t for t in tables}
    assert by_code["T-02"]["status"] == "BOOKED"
    assert by_code["T-04"]["status"] == "AVAILABLE"
    assert by_code["B-01"]["shape"] == "BOOTH_6"

    all_menu_resp = await client.get("/api/v1/menu")
    assert all_menu_resp.status_code == 200
    all_menu = all_menu_resp.json()
    assert len(all_menu) == 12
    for dish in all_menu:
        assert dish["image_url"].startswith("/media/")
        assert (public_dir / dish["image_url"].lstrip("/")).is_file()

    menu_resp = await client.get("/api/v1/menu?dairy_free=true")
    assert menu_resp.status_code == 200
    df_items = menu_resp.json()
    assert len(df_items) >= 6
    assert all(item["is_dairy_free"] is True for item in df_items)


@pytest.mark.asyncio
async def test_two_phase_seat_locking_and_concurrency(test_env):
    client, _ = test_env
    today_str = date.today().isoformat()

    # Session A acquires 10-minute hold on T-04
    hold_a = await client.post(
        "/api/v1/tables/T-04/hold",
        json={
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "guest-session-alpha",
            "party_size": 2,
        },
    )
    assert hold_a.status_code == 200
    assert hold_a.json()["status"] == "HELD_BY_YOU"
    assert hold_a.json()["ttl_seconds"] == 600

    # Session B tries to hold T-04 concurrently -> HTTP 409 Conflict
    hold_b = await client.post(
        "/api/v1/tables/T-04/hold",
        json={
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "guest-session-bravo",
            "party_size": 2,
        },
    )
    assert hold_b.status_code == 409

    # Visibility check: Session A sees HELD_BY_YOU, Session B sees HELD_BY_OTHERS
    list_a = await client.get(
        f"/api/v1/tables?date={today_str}&time_slot=20:30&session_id=guest-session-alpha"
    )
    list_b = await client.get(
        f"/api/v1/tables?date={today_str}&time_slot=20:30&session_id=guest-session-bravo"
    )
    t04_a = next(t for t in list_a.json() if t["table_code"] == "T-04")
    t04_b = next(t for t in list_b.json() if t["table_code"] == "T-04")
    assert t04_a["status"] == "HELD_BY_YOU"
    assert t04_b["status"] == "HELD_BY_OTHERS"
    assert t04_b["hold_ttl_seconds"] > 0

    # Session B cannot steal confirmation
    menu_items = (await client.get("/api/v1/menu")).json()
    salmon = next(m for m in menu_items if m["slug"] == "miso-norwegian-salmon")
    coupe = next(m for m in menu_items if m["slug"] == "smoked-hibiscus-mocktail")

    hijack_confirm = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": "T-04",
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "guest-session-bravo",
            "guest_name": "Impostor",
            "guest_phone": "+8801700000000",
            "party_size": 2,
            "items": [],
        },
    )
    assert hijack_confirm.status_code == 409

    # Session A confirms booking with pre-order items
    confirm_a = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": "T-04",
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "guest-session-alpha",
            "guest_name": "Tariq Hasan",
            "guest_phone": "+8801711223344",
            "party_size": 2,
            "special_occasion": "Anniversary",
            "items": [
                {
                    "menu_item_id": salmon["id"],
                    "quantity": 1,
                    "selected_modifiers": {"portion": "220g Center Fillet", "sides": []},
                },
                {
                    "menu_item_id": coupe["id"],
                    "quantity": 1,
                    "selected_modifiers": {"portion": "Single Crystal Coupe", "sides": []},
                },
            ],
        },
    )
    assert confirm_a.status_code == 201
    ticket = confirm_a.json()
    assert ticket["reference_code"].startswith("NOC-")
    assert float(ticket["pre_order_total_bdt"]) == 3100.0
    assert ticket["status"] == "CONFIRMED"
    assert len(ticket["items"]) == 2

    # Subsequent hold attempt on confirmed table fails with 409
    hold_after = await client.post(
        "/api/v1/tables/T-04/hold",
        json={
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "guest-session-charlie",
            "party_size": 2,
        },
    )
    assert hold_after.status_code == 409

    # Check-in lifecycle test
    checkin = await client.post(f"/api/v1/reservations/{ticket['reference_code']}/check-in")
    assert checkin.status_code == 200
    assert checkin.json()["status"] == "SEATED"
    assert checkin.json()["version"] == 2


def test_database_url_normalization_for_cloud_providers():
    from app.core.config import normalize_database_url

    assert (
        normalize_database_url(
            '"postgresql://user:pass@ep-cool.neon.tech/neondb?sslmode=require&channel_binding=require"'
        )
        == "postgresql+asyncpg://user:pass@ep-cool.neon.tech/neondb?ssl=require"
    )
    assert (
        normalize_database_url("postgres://u:p@postgres.railway.internal:5432/railway")
        == "postgresql+asyncpg://u:p@postgres.railway.internal:5432/railway"
    )
    assert (
        normalize_database_url("postgresql+asyncpg://u:p@ep.neon.tech/neondb?ssl=require")
        == "postgresql+asyncpg://u:p@ep.neon.tech/neondb?ssl=require"
    )
