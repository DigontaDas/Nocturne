from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, patch

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
async def payment_client():
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


async def _create_confirmed_reservation(client: AsyncClient, method: str = "BKASH") -> str:
    today_str = date.today().isoformat()
    hold = await client.post(
        "/api/v1/tables/T-04/hold",
        json={
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "pay-session-1",
            "party_size": 2,
        },
    )
    assert hold.status_code == 200

    menu_items = (await client.get("/api/v1/menu")).json()
    salmon = next(m for m in menu_items if m["slug"] == "miso-norwegian-salmon")

    confirm = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": "T-04",
            "reservation_date": today_str,
            "time_slot": "20:30",
            "session_id": "pay-session-1",
            "guest_name": "Nadia Karim",
            "guest_phone": "+8801711998877",
            "party_size": 2,
            "payment_method": method,
            "items": [
                {"menu_item_id": salmon["id"], "quantity": 1, "selected_modifiers": {}}
            ],
        },
    )
    assert confirm.status_code == 201
    return confirm.json()["reference_code"]


@pytest.mark.asyncio
async def test_payment_config_and_demo_bkash_card_flow(payment_client: AsyncClient):
    cfg = await payment_client.get("/api/v1/payments/config")
    assert cfg.status_code == 200
    assert cfg.json()["table_deposit_bdt"] == 1000

    ref_code = await _create_confirmed_reservation(payment_client, method="BKASH")

    # Initiate demo bKash early payment
    init_resp = await payment_client.post(
        "/api/v1/payments/init",
        json={"reference_code": ref_code, "gateway": "bkash"},
    )
    assert init_resp.status_code == 200
    init_data = init_resp.json()
    assert init_data["gateway"] == "bkash"
    assert init_data["mode"] == "demo_simulation"
    assert float(init_data["amount_bdt"]) == 2450.0

    # Cancel first, ensure reservation remains unpaid
    cancel_resp = await payment_client.post(
        "/api/v1/payments/verify",
        json={
            "reference_code": ref_code,
            "gateway": "bkash",
            "payment_id": init_data["payment_id"],
            "status": "cancel",
        },
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["payment_status"] == "CANCELLED"

    # Switch to Card payment & complete idempotently
    init_card = await payment_client.post(
        "/api/v1/payments/init",
        json={"reference_code": ref_code, "gateway": "card"},
    )
    assert init_card.status_code == 200
    card_pid = init_card.json()["payment_id"]

    verify1 = await payment_client.post(
        "/api/v1/payments/verify",
        json={
            "reference_code": ref_code,
            "gateway": "card",
            "payment_id": card_pid,
            "status": "success",
        },
    )
    assert verify1.status_code == 200
    assert verify1.json()["payment_status"] == "PAID"
    assert verify1.json()["already_processed"] is False

    # Re-verifying the same payment_id must be idempotent
    verify2 = await payment_client.post(
        "/api/v1/payments/verify",
        json={
            "reference_code": ref_code,
            "gateway": "card",
            "payment_id": card_pid,
            "status": "success",
        },
    )
    assert verify2.status_code == 200
    assert verify2.json()["already_processed"] is True
    assert verify2.json()["payment_status"] == "PAID"


@pytest.mark.asyncio
async def test_live_bkash_clarity_gateway_contract(payment_client: AsyncClient):
    ref_code = await _create_confirmed_reservation(payment_client, method="BKASH")

    with (
        patch("app.services.payments.bkash_is_configured", return_value=True),
        patch(
            "app.services.payments._create_bkash_payment",
            new=AsyncMock(
                return_value={
                    "paymentID": "TR0011BKASHMOCK123",
                    "bkashURL": "https://tokenized.sandbox.bka.sh/checkout/TR0011BKASHMOCK123",
                    "raw": {"paymentID": "TR0011BKASHMOCK123"},
                }
            ),
        ) as mock_create,
        patch(
            "app.services.payments._execute_bkash_payment",
            new=AsyncMock(
                return_value={
                    "transactionStatus": "Completed",
                    "trxID": "BKA99887766",
                    "amount": "2450",
                }
            ),
        ),
    ):
        init_resp = await payment_client.post(
            "/api/v1/payments/init",
            json={
                "reference_code": ref_code,
                "gateway": "bkash",
                "return_origin": "https://nocturne.example.com",
            },
        )
        assert init_resp.status_code == 200
        assert init_resp.json()["mode"] == "gateway"
        assert (
            init_resp.json()["checkout_url"]
            == "https://tokenized.sandbox.bka.sh/checkout/TR0011BKASHMOCK123"
        )
        # Ensure plain callbackURL with NO pre-existing query params
        called_kwargs = mock_create.call_args.kwargs
        assert called_kwargs["callback_url"] == f"https://nocturne.example.com/booking/{ref_code}"
        assert "?" not in called_kwargs["callback_url"]

        verify_resp = await payment_client.post(
            "/api/v1/payments/verify",
            json={
                "reference_code": ref_code,
                "gateway": "bkash",
                "payment_id": "TR0011BKASHMOCK123",
                "status": "success",
            },
        )
        assert verify_resp.status_code == 200
        assert verify_resp.json()["payment_status"] == "PAID"
        assert verify_resp.json()["payment_reference"] == "BKA99887766"


@pytest.mark.asyncio
async def test_concierge_status_endpoint(payment_client: AsyncClient):
    resp = await payment_client.get("/api/v1/concierge/status")
    assert resp.status_code == 200
    body = resp.json()
    assert "mode" in body
    assert "model" in body
