from __future__ import annotations

import sys
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models import Base
from app.models.entities import PaymentTransaction, Reservation
from scripts.seed_nocturne import seed_database

DHAKA_TZ = timezone(timedelta(hours=6))


@contextmanager
def freeze_utc_now(target_utc: datetime):
    """Deterministically set UTC wall clock for policy window tests."""

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return target_utc.replace(tzinfo=None)
            return target_utc.astimezone(tz)

    with (
        patch("app.services.reservation_serializer.datetime", FrozenDateTime),
        patch("app.services.reservations.datetime", FrozenDateTime),
    ):
        yield


@pytest_asyncio.fixture
async def lifecycle_env():
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
        yield client, session_factory, fake_redis

    app.dependency_overrides.clear()
    await fake_redis.aclose()
    await engine.dispose()


async def _book_table(
    client: AsyncClient,
    *,
    table_code: str,
    res_date: date,
    time_slot: str = "20:30",
    session_id: str = "sess-1",
    party_size: int = 2,
    guest_name: str = "Ariba Rahman",
    guest_phone: str = "+8801711223344",
    payment_method: str = "PAY_AT_VENUE",
    item_slugs: list[tuple[str, int]] | None = None,
) -> dict:
    hold = await client.post(
        f"/api/v1/tables/{table_code}/hold",
        json={
            "reservation_date": res_date.isoformat(),
            "time_slot": time_slot,
            "session_id": session_id,
            "party_size": party_size,
        },
    )
    assert hold.status_code == 200, hold.text

    items_payload: list[dict] = []
    if item_slugs:
        menu = (await client.get("/api/v1/menu")).json()
        by_slug = {m["slug"]: m for m in menu}
        for slug, qty in item_slugs:
            items_payload.append(
                {
                    "menu_item_id": by_slug[slug]["id"],
                    "quantity": qty,
                    "selected_modifiers": {},
                }
            )

    confirm = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": table_code,
            "reservation_date": res_date.isoformat(),
            "time_slot": time_slot,
            "session_id": session_id,
            "guest_name": guest_name,
            "guest_phone": guest_phone,
            "party_size": party_size,
            "payment_method": payment_method,
            "items": items_payload,
        },
    )
    assert confirm.status_code == 201, confirm.text
    return confirm.json()


async def _settle_demo_payment(client: AsyncClient, ref_code: str, gateway: str = "bkash") -> dict:
    init_resp = await client.post(
        "/api/v1/payments/init",
        json={"reference_code": ref_code, "gateway": gateway},
    )
    assert init_resp.status_code == 200, init_resp.text
    payment_id = init_resp.json()["payment_id"]

    verify_resp = await client.post(
        "/api/v1/payments/verify",
        json={
            "reference_code": ref_code,
            "gateway": gateway,
            "payment_id": payment_id,
            "status": "success",
        },
    )
    assert verify_resp.status_code == 200, verify_resp.text
    assert verify_resp.json()["payment_status"] == "PAID"
    return verify_resp.json()


@pytest.mark.asyncio
async def test_hold_switch_release_and_non_owner_protection(lifecycle_env):
    client, _, _ = lifecycle_env
    future_date = date.today() + timedelta(days=2)

    hold1 = await client.post(
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-alpha",
            "party_size": 2,
        },
    )
    assert hold1.status_code == 200

    # Concurrent second guest is blocked with 409
    race = await client.post(
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-beta",
            "party_size": 2,
        },
    )
    assert race.status_code == 409

    # Same owner refreshing own hold succeeds
    own_refresh = await client.post(
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-alpha",
            "party_size": 2,
        },
    )
    assert own_refresh.status_code == 200

    # Guest-beta cannot steal/release Guest-alpha's hold
    wrong_release = await client.request(
        "DELETE",
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-beta",
        },
    )
    assert wrong_release.status_code == 200
    assert wrong_release.json()["released"] is False

    # Guest-alpha releases T-01 and moves to T-02 -> Guest-beta can now hold T-01
    own_release = await client.request(
        "DELETE",
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-alpha",
        },
    )
    assert own_release.json()["released"] is True

    hold2 = await client.post(
        "/api/v1/tables/T-02/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-alpha",
            "party_size": 2,
        },
    )
    assert hold2.status_code == 200

    beta_takes_t01 = await client.post(
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "20:30",
            "session_id": "guest-beta",
            "party_size": 2,
        },
    )
    assert beta_takes_t01.status_code == 200


@pytest.mark.asyncio
async def test_over_capacity_and_expired_or_wrong_session_confirm(lifecycle_env):
    client, _, fake_redis = lifecycle_env
    future_date = date.today() + timedelta(days=2)

    # T-01 max capacity is 2 -> party_size 4 rejected
    over_cap = await client.post(
        "/api/v1/tables/T-01/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "19:00",
            "session_id": "sess-cap",
            "party_size": 4,
        },
    )
    assert over_cap.status_code == 422

    # Valid hold under wrong session cannot confirm
    hold = await client.post(
        "/api/v1/tables/T-04/hold",
        json={
            "reservation_date": future_date.isoformat(),
            "time_slot": "19:00",
            "session_id": "real-owner",
            "party_size": 2,
        },
    )
    assert hold.status_code == 200

    wrong_confirm = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": "T-04",
            "reservation_date": future_date.isoformat(),
            "time_slot": "19:00",
            "session_id": "hijack-session",
            "guest_name": "Impostor",
            "guest_phone": "+8801700000001",
            "party_size": 2,
            "payment_method": "PAY_AT_VENUE",
            "items": [],
        },
    )
    assert wrong_confirm.status_code == 409

    # Simulate 10-minute TTL expiry -> original owner confirm fails cleanly with 409
    await fake_redis.flushall()
    expired_confirm = await client.post(
        "/api/v1/reservations/confirm",
        json={
            "table_code": "T-04",
            "reservation_date": future_date.isoformat(),
            "time_slot": "19:00",
            "session_id": "real-owner",
            "guest_name": "Late Guest",
            "guest_phone": "+8801700000002",
            "party_size": 2,
            "payment_method": "PAY_AT_VENUE",
            "items": [],
        },
    )
    assert expired_confirm.status_code == 409


@pytest.mark.asyncio
async def test_unpaid_cancellation_releases_seat_for_second_guest(lifecycle_env):
    client, _, _ = lifecycle_env
    future_date = date.today() + timedelta(days=2)

    booking = await _book_table(
        client,
        table_code="T-05",
        res_date=future_date,
        time_slot="20:30",
        session_id="guest-one",
        payment_method="PAY_AT_VENUE",
        item_slugs=[],
    )
    ref_code = booking["reference_code"]
    assert booking["cancellation_policy"]["policy_tier"] == "UNPAID_FREE_CANCEL"

    cancel_resp = await client.post(
        f"/api/v1/reservations/{ref_code}/cancel",
        json={"reason": "Change of plans"},
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    body = cancel_resp.json()
    assert body["table_released"] is True
    assert float(body["refund_amount_bdt"]) == 0.0
    assert float(body["forfeited_fee_bdt"]) == 0.0
    assert body["reservation"]["status"] == "CANCELLED"

    # Seat must appear AVAILABLE again in table availability
    avail = await client.get(
        f"/api/v1/tables?date={future_date.isoformat()}&time_slot=20:30"
    )
    t05 = next(t for t in avail.json() if t["table_code"] == "T-05")
    assert t05["status"] == "AVAILABLE"

    # Second guest successfully confirms T-05 at exact same date & slot
    rebooked = await _book_table(
        client,
        table_code="T-05",
        res_date=future_date,
        time_slot="20:30",
        session_id="guest-two",
        guest_name="Farhan Hossain",
        guest_phone="+8801811223344",
    )
    assert rebooked["status"] == "CONFIRMED"
    assert rebooked["table_code"] == "T-05"


@pytest.mark.asyncio
async def test_early_paid_cancellation_full_refund_and_idempotency(lifecycle_env):
    client, session_factory, _ = lifecycle_env
    future_date = date.today() + timedelta(days=3)

    booking = await _book_table(
        client,
        table_code="T-06",
        res_date=future_date,
        time_slot="20:30",
        session_id="early-cancel-sess",
        payment_method="BKASH",
        item_slugs=[("wagyu-ribeye-steak", 1), ("smoked-hibiscus-mocktail", 1)],
    )
    ref_code = booking["reference_code"]
    await _settle_demo_payment(client, ref_code, gateway="bkash")

    # Fetch reservation and check FREE_FULL_REFUND tier
    fetched = await client.get(f"/api/v1/reservations/{ref_code}")
    assert fetched.status_code == 200
    fjson = fetched.json()
    paid_total = float(fjson["paid_amount_bdt"])
    assert paid_total > 4000.0
    assert fjson["cancellation_policy"]["policy_tier"] == "FREE_FULL_REFUND"
    assert fjson["cancellation_policy"]["can_cancel"] is True
    assert float(fjson["cancellation_policy"]["estimated_refund_bdt"]) == paid_total

    # Cancel >= 4h before seating -> 100% refund
    cancel1 = await client.post(
        f"/api/v1/reservations/{ref_code}/cancel",
        json={"reason": "Flight rescheduled"},
    )
    assert cancel1.status_code == 200
    c1 = cancel1.json()
    assert float(c1["refund_amount_bdt"]) == paid_total
    assert float(c1["forfeited_fee_bdt"]) == 0.0
    assert c1["reservation"]["status"] == "CANCELLED"
    assert c1["reservation"]["payment_status"] == "REFUNDED"
    assert c1["table_released"] is True

    # Verify DB ledger has exactly one CHARGE and one REFUND
    async with session_factory() as db:
        res_row = (
            await db.execute(select(Reservation).where(Reservation.reference_code == ref_code))
        ).scalar_one()
        txs = (
            await db.execute(
                select(PaymentTransaction).where(PaymentTransaction.reservation_id == res_row.id)
            )
        ).scalars().all()
        assert [t.transaction_type for t in txs].count("CHARGE") == 1
        refunds = [t for t in txs if t.transaction_type == "REFUND"]
        assert len(refunds) == 1
        assert float(refunds[0].amount_bdt) == paid_total

    # Calling cancel a second time must be idempotent and NOT double-refund
    cancel2 = await client.post(f"/api/v1/reservations/{ref_code}/cancel", json={})
    assert cancel2.status_code == 200
    assert float(cancel2.json()["refund_amount_bdt"]) == paid_total

    async with session_factory() as db:
        res_row = (
            await db.execute(select(Reservation).where(Reservation.reference_code == ref_code))
        ).scalar_one()
        refunds = (
            await db.execute(
                select(PaymentTransaction).where(
                    PaymentTransaction.reservation_id == res_row.id,
                    PaymentTransaction.transaction_type == "REFUND",
                )
            )
        ).scalars().all()
        assert len(refunds) == 1

    # Table T-06 is immediately bookable by a new guest
    rebooked = await _book_table(
        client,
        table_code="T-06",
        res_date=future_date,
        time_slot="20:30",
        session_id="new-guest-t06",
    )
    assert rebooked["status"] == "CONFIRMED"


@pytest.mark.asyncio
async def test_last_minute_cancel_table_deposit_forfeit_vs_partial_preorder_refund(lifecycle_env):
    client, session_factory, _ = lifecycle_env
    booking_date = date.today() + timedelta(days=1)

    # Case A: Table-only reservation (pre_order == 0 -> settled 1,000 BDT table deposit)
    table_only = await _book_table(
        client,
        table_code="T-07",
        res_date=booking_date,
        time_slot="20:30",
        session_id="lastmin-deposit",
        party_size=4,
        payment_method="CARD",
        item_slugs=[],
    )
    ref_a = table_only["reference_code"]
    verified_a = await _settle_demo_payment(client, ref_a, gateway="card")
    assert float(verified_a["paid_amount_bdt"]) == 1000.0

    # Case B: Large pre-order (2x Wagyu Ribeye > 5,000 BDT) settled via bKash
    big_order = await _book_table(
        client,
        table_code="T-08",
        res_date=booking_date,
        time_slot="20:30",
        session_id="lastmin-preorder",
        party_size=4,
        payment_method="BKASH",
        item_slugs=[("wagyu-ribeye-steak", 2)],
    )
    ref_b = big_order["reference_code"]
    verified_b = await _settle_demo_payment(client, ref_b, gateway="bkash")
    paid_b = float(verified_b["paid_amount_bdt"])
    assert paid_b >= 5000.0

    # Freeze clock to 1 hour before 20:30 Dhaka seating (< 4 hours notice)
    seating_dhaka = datetime(
        booking_date.year, booking_date.month, booking_date.day, 20, 30, tzinfo=DHAKA_TZ
    )
    one_hour_before_utc = (seating_dhaka - timedelta(hours=1)).astimezone(timezone.utc)

    with freeze_utc_now(one_hour_before_utc):
        # Case A preview & cancel -> full 1,000 BDT deposit forfeited
        preview_a = (await client.get(f"/api/v1/reservations/{ref_a}")).json()
        assert preview_a["cancellation_policy"]["policy_tier"] == "LAST_MINUTE_FORFEIT"
        assert float(preview_a["cancellation_policy"]["forfeited_fee_bdt"]) == 1000.0
        assert float(preview_a["cancellation_policy"]["estimated_refund_bdt"]) == 0.0

        cancel_a = await client.post(
            f"/api/v1/reservations/{ref_a}/cancel",
            json={"reason": "Traffic gridlock"},
        )
        assert cancel_a.status_code == 200
        ca = cancel_a.json()
        assert float(ca["forfeited_fee_bdt"]) == 1000.0
        assert float(ca["refund_amount_bdt"]) == 0.0
        assert ca["reservation"]["payment_status"] == "FORFEITED"
        assert ca["reservation"]["status"] == "CANCELLED"
        assert ca["table_released"] is True

        # Case B preview & cancel -> 1,000 BDT table fee retained, food balance refunded
        preview_b = (await client.get(f"/api/v1/reservations/{ref_b}")).json()
        assert preview_b["cancellation_policy"]["policy_tier"] == "LAST_MINUTE_PARTIAL"
        assert float(preview_b["cancellation_policy"]["forfeited_fee_bdt"]) == 1000.0
        assert float(preview_b["cancellation_policy"]["estimated_refund_bdt"]) == paid_b - 1000.0

        cancel_b = await client.post(
            f"/api/v1/reservations/{ref_b}/cancel",
            json={"reason": "Emergency last minute"},
        )
        assert cancel_b.status_code == 200
        cb = cancel_b.json()
        assert float(cb["forfeited_fee_bdt"]) == 1000.0
        assert float(cb["refund_amount_bdt"]) == paid_b - 1000.0
        assert cb["reservation"]["payment_status"] == "PARTIALLY_REFUNDED"
        assert cb["reservation"]["status"] == "CANCELLED"
        assert cb["table_released"] is True

    # Confirm Case A created zero REFUND transactions and Case B created partial REFUND
    async with session_factory() as db:
        row_a = (await db.execute(select(Reservation).where(Reservation.reference_code == ref_a))).scalar_one()
        refunds_a = (
            await db.execute(
                select(PaymentTransaction).where(
                    PaymentTransaction.reservation_id == row_a.id,
                    PaymentTransaction.transaction_type == "REFUND",
                )
            )
        ).scalars().all()
        assert len(refunds_a) == 0

        row_b = (await db.execute(select(Reservation).where(Reservation.reference_code == ref_b))).scalar_one()
        refunds_b = (
            await db.execute(
                select(PaymentTransaction).where(
                    PaymentTransaction.reservation_id == row_b.id,
                    PaymentTransaction.transaction_type == "REFUND",
                )
            )
        ).scalars().all()
        assert len(refunds_b) == 1
        assert float(refunds_b[0].amount_bdt) == paid_b - 1000.0

    # Both seats are re-bookable immediately
    assert (
        await _book_table(
            client, table_code="T-07", res_date=booking_date, time_slot="20:30", session_id="walkin-7", party_size=2
        )
    )["status"] == "CONFIRMED"
    assert (
        await _book_table(
            client, table_code="T-08", res_date=booking_date, time_slot="20:30", session_id="walkin-8", party_size=2
        )
    )["status"] == "CONFIRMED"


@pytest.mark.asyncio
async def test_no_show_grace_window_settlement_and_rebooking_after_noshow(lifecycle_env):
    client, _, _ = lifecycle_env
    booking_date = date.today() + timedelta(days=1)

    # VIP Booth B-01 with pre-order settled via Card
    vip_booking = await _book_table(
        client,
        table_code="B-01",
        res_date=booking_date,
        time_slot="20:30",
        session_id="vip-noshow",
        party_size=4,
        payment_method="CARD",
        item_slugs=[("wagyu-ribeye-steak", 2)],
    )
    ref_vip = vip_booking["reference_code"]
    paid_vip = float((await _settle_demo_payment(client, ref_vip, gateway="card"))["paid_amount_bdt"])

    # Also table-only B-02 deposit no-show
    dep_booking = await _book_table(
        client,
        table_code="B-02",
        res_date=booking_date,
        time_slot="20:30",
        session_id="dep-noshow",
        party_size=4,
        payment_method="BKASH",
        item_slugs=[],
    )
    ref_dep = dep_booking["reference_code"]
    await _settle_demo_payment(client, ref_dep, gateway="bkash")

    seating_dhaka = datetime(
        booking_date.year, booking_date.month, booking_date.day, 20, 30, tzinfo=DHAKA_TZ
    )
    five_min_past_utc = (seating_dhaka + timedelta(minutes=5)).astimezone(timezone.utc)
    twenty_min_past_utc = (seating_dhaka + timedelta(minutes=20)).astimezone(timezone.utc)

    # Inside 15-min grace period: host cannot mark NO_SHOW without override
    with freeze_utc_now(five_min_past_utc):
        blocked = await client.post(
            f"/api/v1/reservations/{ref_vip}/no-show",
            json={"host_override": False},
        )
        assert blocked.status_code == 409

    # Past 15-min grace window: NO_SHOW allowed automatically
    with freeze_utc_now(twenty_min_past_utc):
        ns_vip = await client.post(
            f"/api/v1/reservations/{ref_vip}/no-show",
            json={"note": "Guest unreachable after 20 min"},
        )
        assert ns_vip.status_code == 200, ns_vip.text
        nv = ns_vip.json()
        assert nv["reservation"]["status"] == "NO_SHOW"
        assert nv["reservation"]["payment_status"] == "PARTIALLY_REFUNDED"
        assert float(nv["forfeited_fee_bdt"]) == 1000.0
        assert float(nv["refund_amount_bdt"]) == paid_vip - 1000.0
        assert nv["table_released"] is True

        # Calling no-show on table-only deposit -> FORFEITED (0 refund)
        ns_dep = await client.post(
            f"/api/v1/reservations/{ref_dep}/no-show",
            json={},
        )
        assert ns_dep.status_code == 200
        nd = ns_dep.json()
        assert nd["reservation"]["status"] == "NO_SHOW"
        assert nd["reservation"]["payment_status"] == "FORFEITED"
        assert float(nd["forfeited_fee_bdt"]) == 1000.0
        assert float(nd["refund_amount_bdt"]) == 0.0

    # CRITICAL: uq_active_table_slot must allow another guest/walk-in to confirm B-01 & B-02
    walkin_b01 = await _book_table(
        client,
        table_code="B-01",
        res_date=booking_date,
        time_slot="20:30",
        session_id="walkin-b01",
        party_size=4,
        guest_name="Walk-in VIP",
        guest_phone="+8801911223344",
    )
    assert walkin_b01["status"] == "CONFIRMED"
    assert walkin_b01["table_code"] == "B-01"

    # Trying to check-in a NO_SHOW reservation must be rejected with 409
    late_checkin = await client.post(f"/api/v1/reservations/{ref_vip}/check-in")
    assert late_checkin.status_code == 409


@pytest.mark.asyncio
async def test_seated_guard_phone_verification_lookup_and_live_gateway_refunds(lifecycle_env):
    client, _, _ = lifecycle_env
    future_date = date.today() + timedelta(days=4)

    # 1. Seated reservation cannot be cancelled or marked no-show
    seated_booking = await _book_table(
        client,
        table_code="T-09",
        res_date=future_date,
        time_slot="19:00",
        session_id="seated-guard",
        guest_phone="+8801755667788",
    )
    ref_seated = seated_booking["reference_code"]
    checked_in = await client.post(f"/api/v1/reservations/{ref_seated}/check-in")
    assert checked_in.status_code == 200
    assert checked_in.json()["status"] == "SEATED"

    assert (await client.post(f"/api/v1/reservations/{ref_seated}/cancel", json={})).status_code == 409
    assert (
        await client.post(
            f"/api/v1/reservations/{ref_seated}/no-show",
            json={"host_override": True},
        )
    ).status_code == 409

    # 2. Reservation lookup by phone and reference_code
    assert (await client.get("/api/v1/reservations")).status_code == 400
    by_phone = await client.get("/api/v1/reservations?phone=01755667788")
    assert by_phone.status_code == 200
    assert any(r["reference_code"] == ref_seated for r in by_phone.json())
    by_ref = await client.get(f"/api/v1/reservations?reference_code={ref_seated}")
    assert by_ref.status_code == 200
    assert len(by_ref.json()) == 1

    # 3. Phone mismatch -> 403, matching phone -> 200
    phone_check = await _book_table(
        client,
        table_code="T-10",
        res_date=future_date,
        time_slot="19:00",
        session_id="phone-guard",
        guest_phone="+8801799887766",
    )
    ref_phone = phone_check["reference_code"]
    bad_phone = await client.post(
        f"/api/v1/reservations/{ref_phone}/cancel",
        json={"guest_phone": "+8801700000000"},
    )
    assert bad_phone.status_code == 403
    good_phone = await client.post(
        f"/api/v1/reservations/{ref_phone}/cancel",
        json={"guest_phone": "01799887766"},
    )
    assert good_phone.status_code == 200
    assert good_phone.json()["reservation"]["status"] == "CANCELLED"
    assert (await client.post(f"/api/v1/reservations/{ref_phone}/check-in")).status_code == 409

    # 4. Mocked Live bKash refund contract
    live_bkash = await _book_table(
        client,
        table_code="T-11",
        res_date=future_date,
        time_slot="20:30",
        session_id="live-bkash-ref",
        payment_method="BKASH",
        item_slugs=[("miso-norwegian-salmon", 1)],
    )
    ref_bk = live_bkash["reference_code"]
    with (
        patch("app.services.payments.bkash_is_configured", return_value=True),
        patch(
            "app.services.payments._create_bkash_payment",
            new=AsyncMock(
                return_value={
                    "paymentID": "BK_LIVE_PAY_1",
                    "bkashURL": "https://checkout.bkash.test/BK_LIVE_PAY_1",
                    "raw": {"paymentID": "BK_LIVE_PAY_1"},
                }
            ),
        ),
        patch(
            "app.services.payments._execute_bkash_payment",
            new=AsyncMock(
                return_value={"transactionStatus": "Completed", "trxID": "TRX_BK_999"}
            ),
        ),
        patch(
            "app.services.payments._refund_bkash_payment",
            new=AsyncMock(return_value={"refundTrxID": "REF_BK_111", "transactionStatus": "Completed"}),
        ) as mock_bk_refund,
    ):
        init_bk = await client.post(
            "/api/v1/payments/init",
            json={"reference_code": ref_bk, "gateway": "bkash"},
        )
        assert init_bk.status_code == 200
        ver_bk = await client.post(
            "/api/v1/payments/verify",
            json={
                "reference_code": ref_bk,
                "gateway": "bkash",
                "payment_id": "BK_LIVE_PAY_1",
                "status": "success",
            },
        )
        assert ver_bk.status_code == 200

        canc_bk = await client.post(
            f"/api/v1/reservations/{ref_bk}/cancel",
            json={"reason": "Customer requested refund"},
        )
        assert canc_bk.status_code == 200
        assert canc_bk.json()["reservation"]["payment_status"] == "REFUNDED"
        assert mock_bk_refund.await_count == 1
        assert mock_bk_refund.call_args.kwargs["payment_id"] == "BK_LIVE_PAY_1"
        assert mock_bk_refund.call_args.kwargs["trx_id"] == "TRX_BK_999"

    # 5. Mocked Live Stripe partial refund contract (< 4h last-minute cancellation)
    live_stripe = await _book_table(
        client,
        table_code="T-12",
        res_date=future_date,
        time_slot="20:30",
        session_id="live-stripe-ref",
        payment_method="CARD",
        item_slugs=[("wagyu-ribeye-steak", 2)],
    )
    ref_st = live_stripe["reference_code"]
    with (
        patch("app.services.payments.stripe_is_configured", return_value=True),
        patch(
            "app.services.payments._create_stripe_checkout_session",
            new=AsyncMock(
                return_value={
                    "session_id": "cs_test_nocturne_1",
                    "url": "https://checkout.stripe.com/pay/cs_test_nocturne_1",
                    "raw": {"id": "cs_test_nocturne_1"},
                }
            ),
        ),
        patch(
            "app.services.payments._retrieve_stripe_session",
            new=AsyncMock(
                return_value={
                    "id": "cs_test_nocturne_1",
                    "payment_status": "paid",
                    "payment_intent": "pi_nocturne_987",
                }
            ),
        ),
        patch(
            "app.services.payments._refund_stripe_payment",
            new=AsyncMock(return_value={"id": "re_nocturne_123", "status": "succeeded"}),
        ) as mock_st_refund,
    ):
        init_st = await client.post(
            "/api/v1/payments/init",
            json={"reference_code": ref_st, "gateway": "card"},
        )
        assert init_st.status_code == 200
        ver_st = await client.post(
            "/api/v1/payments/verify",
            json={
                "reference_code": ref_st,
                "gateway": "card",
                "payment_id": "cs_test_nocturne_1",
                "status": "success",
            },
        )
        assert ver_st.status_code == 200
        paid_st = Decimal(str(ver_st.json()["paid_amount_bdt"]))

        two_hours_before_utc = (
            datetime(future_date.year, future_date.month, future_date.day, 20, 30, tzinfo=DHAKA_TZ)
            - timedelta(hours=2)
        ).astimezone(timezone.utc)

        with freeze_utc_now(two_hours_before_utc):
            canc_st = await client.post(
                f"/api/v1/reservations/{ref_st}/cancel",
                json={"reason": "Last minute delay"},
            )
            assert canc_st.status_code == 200
            cs_body = canc_st.json()
            assert cs_body["reservation"]["payment_status"] == "PARTIALLY_REFUNDED"
            assert Decimal(str(cs_body["forfeited_fee_bdt"])) == Decimal("1000")
            assert Decimal(str(cs_body["refund_amount_bdt"])) == paid_st - Decimal("1000")
            assert mock_st_refund.await_count == 1
            assert mock_st_refund.call_args.kwargs["payment_intent_id"] == "pi_nocturne_987"
            assert mock_st_refund.call_args.kwargs["amount_bdt"] == paid_st - Decimal("1000")
