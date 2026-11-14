from __future__ import annotations

import json
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


def _parse_sse(raw_body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in raw_body.strip().split("\n\n"):
        if not block.strip():
            continue
        event_name = "message"
        data_line = "{}"
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_line = line.split(":", 1)[1].strip()
        events.append((event_name, json.loads(data_line)))
    return events


@pytest_asyncio.fixture
async def concierge_client():
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
        yield client

    app.dependency_overrides.clear()
    await fake_redis.aclose()
    await engine.dispose()


@pytest.mark.asyncio
async def test_concierge_hybrid_rag_and_sql_stream(concierge_client: AsyncClient):
    today_str = date.today().isoformat()
    prompt = (
        "Looking for a quiet table away from the kitchen for 2 tonight, "
        "plus a dairy-free main dish and mocktail pairing under ৳3,500"
    )
    resp = await concierge_client.post(
        "/api/v1/concierge/stream",
        json={
            "message": prompt,
            "reservation_date": today_str,
            "time_slot": "20:30",
            "party_size": 2,
            "session_id": "concierge-test-session",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(resp.text)
    event_names = [name for name, _ in events]
    assert "trace" in event_names
    assert "citation" in event_names
    assert "token" in event_names
    assert "cards" in event_names
    assert event_names[-1] == "done"

    done_payload = next(data for name, data in events if name == "done")
    assert done_payload["ok"] is True

    cards_payload = next(data for name, data in events if name == "cards")
    table = cards_payload["recommended_table"]
    assert table is not None
    assert table["table_code"] in {"T-04", "T-01", "T-03"}  # T-02 is seeded as BOOKED
    assert table["is_quiet_zone"] is True
    assert table["perspective_photo_url"].startswith("/media/")

    dishes = cards_payload["recommended_dishes"]
    assert len(dishes) == 2
    assert all(d["is_dairy_free"] is True for d in dishes)
    assert all(d["image_url"].startswith("/media/") for d in dishes)
    assert cards_payload["pairing_total_bdt"] <= 3500

    streamed_text = "".join(data["text"] for name, data in events if name == "token")
    assert table["table_code"] in streamed_text


@pytest.mark.asyncio
async def test_health_alias_status_and_vercel_cors(concierge_client: AsyncClient):
    health_resp = await concierge_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "ok"

    status_resp = await concierge_client.get("/api/v1/concierge/status")
    assert status_resp.status_code == 200
    status_body = status_resp.json()
    assert "mode" in status_body
    assert "provider" in status_body

    cors_resp = await concierge_client.options(
        "/api/v1/concierge/stream",
        headers={
            "Origin": "https://nocturne-preview-123.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert cors_resp.status_code == 200
    assert (
        cors_resp.headers.get("access-control-allow-origin")
        == "https://nocturne-preview-123.vercel.app"
    )
