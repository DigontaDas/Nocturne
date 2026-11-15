from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models import Base
from scripts.seed_nocturne import seed_database


class _BrokenPipeline:
    def get(self, *_args, **_kwargs):
        return self

    def ttl(self, *_args, **_kwargs):
        return self

    async def execute(self):
        raise RedisConnectionError("Simulated Redis outage during pipeline")


class _BrokenRedis:
    async def eval(self, *_args, **_kwargs):
        raise RedisConnectionError("Simulated Redis outage during eval")

    async def get(self, *_args, **_kwargs):
        raise RedisConnectionError("Simulated Redis outage during get")

    async def delete(self, *_args, **_kwargs):
        raise RedisConnectionError("Simulated Redis outage during delete")

    def pipeline(self):
        return _BrokenPipeline()


@pytest_asyncio.fixture
async def admin_env():
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
        await seed_database(seed_session)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    async def override_get_redis():
        return fake_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, session_factory

    app.dependency_overrides.clear()
    await fake_redis.aclose()
    await engine.dispose()


@pytest.mark.asyncio
async def test_admin_auth_and_catalog_layout_persistence(admin_env):
    client, session_factory = admin_env

    # Unauthenticated access is blocked
    unauth = await client.get("/api/v1/admin/me")
    assert unauth.status_code == 401
    unauth_create = await client.post(
        "/api/v1/admin/menu",
        json={
            "name": "Unauthorized Dish",
            "category": "Mains",
            "description": "Should be rejected without token",
            "base_price_bdt": 1500,
        },
    )
    assert unauth_create.status_code == 401

    # Invalid password is rejected
    bad_login = await client.post(
        "/api/v1/admin/login",
        json={"username": settings.ADMIN_USERNAME, "password": "wrong-password"},
    )
    assert bad_login.status_code == 401

    # Boss login succeeds
    login = await client.post(
        "/api/v1/admin/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/api/v1/admin/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == settings.ADMIN_USERNAME

    # Add a new curated dish with inline data URI image
    tiny_png_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    created_dish_resp = await client.post(
        "/api/v1/admin/menu",
        headers=headers,
        json={
            "name": "Ember Smoked Lobster Ravioli",
            "category": "Mains",
            "description": "Hand-folded pasta with saffron bisque and charred lime butter.",
            "base_price_bdt": 2950,
            "calories_kcal": 610,
            "protein_grams": 38,
            "prep_time_mins": 22,
            "spice_level": 2,
            "is_dairy_free": False,
            "is_nut_free": True,
            "is_gluten_free": False,
            "is_signature": True,
            "allergen_flags": ["Shellfish", "Gluten"],
            "image_url": tiny_png_data,
        },
    )
    assert created_dish_resp.status_code == 201
    created_dish = created_dish_resp.json()
    assert created_dish["slug"] == "ember-smoked-lobster-ravioli"

    # Update the dish
    updated_dish_resp = await client.put(
        f"/api/v1/admin/menu/{created_dish['id']}",
        headers=headers,
        json={"base_price_bdt": 3250, "spice_level": 3},
    )
    assert updated_dish_resp.status_code == 200
    assert float(updated_dish_resp.json()["base_price_bdt"]) == 3250.0

    # Create a new table on the floorplan
    created_table_resp = await client.post(
        "/api/v1/admin/tables",
        headers=headers,
        json={
            "table_code": "T-19",
            "zone_slug": "rooftop",
            "capacity_min": 2,
            "capacity_max": 4,
            "shape": "RECT_4",
            "svg_x": 380,
            "svg_y": 210,
            "svg_rotation": 15,
            "is_window_side": True,
            "is_quiet_zone": True,
            "noise_db": 45,
            "perspective_photo_url": "/media/table-window-edge.png",
            "vibe_notes": "Corner pergola balcony overlook added by Boss.",
        },
    )
    assert created_table_resp.status_code == 201
    created_table = created_table_resp.json()
    assert created_table["table_code"] == "T-19"

    # Batch-update floorplan coordinates & rotation and update image
    layout_resp = await client.post(
        "/api/v1/admin/tables/layout",
        headers=headers,
        json={
            "tables": [
                {
                    "id": created_table["id"],
                    "zone_slug": "main-hall",
                    "svg_x": 620,
                    "svg_y": 265,
                    "svg_rotation": 45,
                }
            ]
        },
    )
    assert layout_resp.status_code == 200
    updated_t19 = next(t for t in layout_resp.json() if t["table_code"] == "T-19")
    assert updated_t19["zone_slug"] == "main-hall"
    assert updated_t19["svg_x"] == 620
    assert updated_t19["svg_rotation"] == 45

    photo_update_resp = await client.put(
        f"/api/v1/admin/tables/{created_table['id']}",
        headers=headers,
        json={"perspective_photo_url": tiny_png_data},
    )
    assert photo_update_resp.status_code == 200
    assert photo_update_resp.json()["perspective_photo_url"] == tiny_png_data

    # Non-destructive startup seed should preserve all Boss edits
    async with session_factory() as verify_session:
        await seed_database(verify_session, force_upsert=False)

    menu_after_seed = await client.get("/api/v1/menu")
    assert menu_after_seed.status_code == 200
    lobster = next(
        m for m in menu_after_seed.json() if m["slug"] == "ember-smoked-lobster-ravioli"
    )
    assert float(lobster["base_price_bdt"]) == 3250.0

    # Delete custom dish & table cleanly
    del_dish = await client.delete(f"/api/v1/admin/menu/{created_dish['id']}", headers=headers)
    assert del_dish.status_code == 200
    del_table = await client.delete(f"/api/v1/admin/tables/{created_table['id']}", headers=headers)
    assert del_table.status_code == 200


@pytest.mark.asyncio
async def test_reservation_confirm_resilience_when_redis_offline_and_slug_fallback(admin_env):
    client, _session_factory = admin_env

    # Simulate complete Redis outage during table hold and confirm
    app.dependency_overrides[get_redis] = lambda: _BrokenRedis()

    today_str = date.today().isoformat()
    session_id = "sess-redis-down-test-01"

    hold_resp = await client.post(
        "/api/v1/tables/T-04/hold",
        json={
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": session_id,
            "party_size": 2,
        },
    )
    assert hold_resp.status_code == 200
    assert hold_resp.json()["status"] == "HELD_BY_YOU"

    # Confirm using stale numeric ID + valid slug while Redis remains unreachable
    confirm_resp = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": "T-04",
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": session_id,
            "guest_name": "Digonta Das",
            "guest_phone": "+8801711000000",
            "party_size": 2,
            "payment_method": "PAY_AT_VENUE",
            "items": [
                {
                    "menu_item_id": 999999,
                    "menu_item_slug": "miso-norwegian-salmon",
                    "quantity": 1,
                    "selected_modifiers": {"portion": "220g Center Fillet"},
                }
            ],
        },
    )
    assert confirm_resp.status_code == 201, confirm_resp.text
    ticket = confirm_resp.json()
    assert ticket["table_code"] == "T-04"
    assert ticket["status"] == "CONFIRMED"
    assert len(ticket["items"]) == 1
    assert ticket["items"][0]["dish_slug"] == "miso-norwegian-salmon"
