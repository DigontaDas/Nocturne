from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.entities import (
    PaymentTransaction,
    Reservation,
    ReservationItem,
    RestaurantTable,
)
from app.schemas.hospitality import (
    GatewayStatusOut,
    PaymentConfigOut,
    PaymentGateway,
    PaymentInitRequest,
    PaymentInitResponse,
    PaymentVerifyRequest,
    PaymentVerifyResponse,
)
from app.services.reservation_serializer import serialize_reservation

# Cached bKash id_token state (mirroring Clarity's server/services/bkash.js token cache)
_bkash_token_lock = asyncio.Lock()
_bkash_cached_token: str | None = None
_bkash_token_expires_at: float = 0.0


def bkash_is_configured() -> bool:
    return all(
        [
            settings.BKASH_APP_KEY.strip(),
            settings.BKASH_APP_SECRET.strip(),
            settings.BKASH_USERNAME.strip(),
            settings.BKASH_PASSWORD.strip(),
        ]
    )


def stripe_is_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY.strip())


def get_payment_config() -> PaymentConfigOut:
    bkash_ready = bkash_is_configured()
    card_ready = stripe_is_configured()
    demo_enabled = bool(settings.PAYMENT_ALLOW_DEMO_SIMULATION)

    return PaymentConfigOut(
        bkash=GatewayStatusOut(
            configured=bkash_ready,
            mode="gateway" if bkash_ready else ("demo_simulation" if demo_enabled else "unconfigured"),
        ),
        card=GatewayStatusOut(
            configured=card_ready,
            mode="gateway" if card_ready else ("demo_simulation" if demo_enabled else "unconfigured"),
        ),
        demo_simulation_enabled=demo_enabled,
        table_deposit_bdt=settings.TABLE_DEPOSIT_BDT,
    )


def _resolve_origin(requested_origin: str | None) -> str:
    if requested_origin:
        parsed = urlparse(requested_origin.strip())
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return settings.FRONTEND_URL.strip().rstrip("/")


async def _grant_bkash_token() -> tuple[str, int]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            settings.BKASH_GRANT_URL.strip(),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "username": settings.BKASH_USERNAME.strip(),
                "password": settings.BKASH_PASSWORD.strip(),
            },
            json={
                "app_key": settings.BKASH_APP_KEY.strip(),
                "app_secret": settings.BKASH_APP_SECRET.strip(),
            },
        )
    data = resp.json()
    token = data.get("id_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=data.get("msg") or data.get("message") or "bKash did not return an id_token.",
        )
    expires_in = int(data.get("expires_in") or 3600)
    return str(token), expires_in


async def _get_bkash_token() -> str:
    global _bkash_cached_token, _bkash_token_expires_at
    async with _bkash_token_lock:
        if _bkash_cached_token and time.monotonic() < _bkash_token_expires_at:
            return _bkash_cached_token
        token, expires_in = await _grant_bkash_token()
        _bkash_cached_token = token
        # Refresh 5 minutes before actual expiration (matching Clarity server/services/bkash.js)
        _bkash_token_expires_at = time.monotonic() + max(60, expires_in - 300)
        return token


async def _bkash_call(path: str, body: dict[str, Any]) -> dict[str, Any]:
    token = await _get_bkash_token()
    base = settings.BKASH_BASE_URL.strip().rstrip("/")
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{base}{path}",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                # Raw id_token without "Bearer " prefix, per verified Clarity bKash integration
                "Authorization": token,
                "X-APP-Key": settings.BKASH_APP_KEY.strip(),
            },
            json=body,
        )
    return resp.json()


async def _create_bkash_payment(
    amount_bdt: Decimal,
    merchant_invoice_number: str,
    payer_reference: str,
    callback_url: str,
) -> dict[str, Any]:
    data = await _bkash_call(
        "/create",
        {
            "mode": "0011",
            "payerReference": payer_reference or "1",
            "callbackURL": callback_url,
            "amount": f"{amount_bdt:.2f}".rstrip("0").rstrip("."),
            "currency": "BDT",
            "intent": "sale",
            "merchantInvoiceNumber": merchant_invoice_number,
        },
    )
    payment_id = data.get("paymentID")
    bkash_url = data.get("bkashURL")
    if not payment_id or not bkash_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=data.get("statusMessage")
            or data.get("message")
            or "bKash did not return a paymentID / bkashURL.",
        )
    return {"paymentID": payment_id, "bkashURL": bkash_url, "raw": data}


async def _execute_bkash_payment(payment_id: str) -> dict[str, Any]:
    return await _bkash_call("/execute", {"paymentID": payment_id})


async def _create_stripe_checkout_session(
    amount_bdt: Decimal,
    reference_code: str,
    guest_name: str,
    description: str,
    success_url: str,
    cancel_url: str,
) -> dict[str, Any]:
    currency = (settings.STRIPE_CURRENCY or "bdt").strip().lower()
    unit_amount = max(50, int((amount_bdt * 100).quantize(Decimal("1"))))
    form_data = {
        "mode": "payment",
        "payment_method_types[0]": "card",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": reference_code,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][unit_amount]": str(unit_amount),
        "line_items[0][price_data][product_data][name]": f"Nocturne Dhaka — {reference_code}",
        "line_items[0][price_data][product_data][description]": f"{guest_name} • {description}",
        "metadata[reference_code]": reference_code,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            headers={
                "Authorization": f"Bearer {settings.STRIPE_SECRET_KEY.strip()}",
            },
            data=form_data,
        )
    data = resp.json()
    if resp.status_code >= 400 or not data.get("id") or not data.get("url"):
        err_msg = (data.get("error") or {}).get("message") or "Stripe session creation failed."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)
    return {"session_id": data["id"], "url": data["url"], "raw": data}


async def _retrieve_stripe_session(session_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
            headers={"Authorization": f"Bearer {settings.STRIPE_SECRET_KEY.strip()}"},
        )
    data = resp.json()
    if resp.status_code >= 400:
        err_msg = (data.get("error") or {}).get("message") or "Stripe verification failed."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)
    return data


async def _load_reservation_by_ref(db: AsyncSession, reference_code: str) -> Reservation:
    code = reference_code.strip().upper()
    stmt = (
        select(Reservation)
        .options(
            selectinload(Reservation.table).selectinload(RestaurantTable.zone),
            selectinload(Reservation.items).selectinload(ReservationItem.menu_item),
        )
        .where(Reservation.reference_code == code)
    )
    reservation = (await db.execute(stmt)).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {code} not found.",
        )
    return reservation


def _compute_payable_bdt(reservation: Reservation) -> Decimal:
    pre_order = reservation.pre_order_total_bdt or Decimal("0.00")
    if pre_order > Decimal("0.00"):
        return pre_order
    return Decimal(str(settings.TABLE_DEPOSIT_BDT))


async def initiate_early_payment(
    db: AsyncSession,
    payload: PaymentInitRequest,
) -> PaymentInitResponse:
    reservation = await _load_reservation_by_ref(db, payload.reference_code)
    if reservation.payment_status == "PAID":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Reservation {reservation.reference_code} is already paid in full.",
        )

    amount_bdt = _compute_payable_bdt(reservation)
    gateway: PaymentGateway = payload.gateway
    origin = _resolve_origin(payload.return_origin)
    merchant_invoice_no = f"{reservation.reference_code}-{uuid.uuid4().hex[:8].upper()}"

    mode: str = "gateway"
    payment_id: str
    checkout_url: str
    raw_payload: dict[str, Any] = {}

    if gateway == "bkash":
        if bkash_is_configured():
            # Plain callbackURL with no pre-existing query string per Clarity / bKash requirement
            callback_url = f"{origin}/booking/{reservation.reference_code}"
            created = await _create_bkash_payment(
                amount_bdt=amount_bdt,
                merchant_invoice_number=merchant_invoice_no,
                payer_reference=reservation.guest_phone or reservation.reference_code,
                callback_url=callback_url,
            )
            payment_id = str(created["paymentID"])
            checkout_url = str(created["bkashURL"])
            raw_payload = created["raw"]
        elif settings.PAYMENT_ALLOW_DEMO_SIMULATION:
            mode = "demo_simulation"
            payment_id = f"DEMO-BKASH-{uuid.uuid4().hex[:10].upper()}"
            checkout_url = (
                f"{origin}/booking/{reservation.reference_code}"
                f"?demo_checkout=1&gateway=bkash&payment_id={payment_id}"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="bKash gateway credentials are not configured in environment.",
            )
    else:
        if stripe_is_configured():
            desc = (
                f"Table {reservation.table.table_code} ({reservation.reservation_date} @ {reservation.time_slot})"
            )
            success_url = (
                f"{origin}/booking/{reservation.reference_code}"
                f"?gateway=card&session_id={{CHECKOUT_SESSION_ID}}"
            )
            cancel_url = f"{origin}/booking/{reservation.reference_code}?gateway=card&status=cancel"
            created = await _create_stripe_checkout_session(
                amount_bdt=amount_bdt,
                reference_code=reservation.reference_code,
                guest_name=reservation.guest_name,
                description=desc,
                success_url=success_url,
                cancel_url=cancel_url,
            )
            payment_id = str(created["session_id"])
            checkout_url = str(created["url"])
            raw_payload = created["raw"]
        elif settings.PAYMENT_ALLOW_DEMO_SIMULATION:
            mode = "demo_simulation"
            payment_id = f"DEMO-CARD-{uuid.uuid4().hex[:10].upper()}"
            checkout_url = (
                f"{origin}/booking/{reservation.reference_code}"
                f"?demo_checkout=1&gateway=card&payment_id={payment_id}"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Card payment gateway (STRIPE_SECRET_KEY) is not configured.",
            )

    tx = PaymentTransaction(
        reservation_id=reservation.id,
        gateway=gateway,
        transaction_type="CHARGE",
        mode=mode,
        merchant_invoice_no=merchant_invoice_no,
        gateway_payment_id=payment_id,
        amount_bdt=amount_bdt,
        currency="BDT",
        status="PENDING",
        raw_payload=raw_payload,
    )
    db.add(tx)
    reservation.payment_method = "BKASH" if gateway == "bkash" else "CARD"
    reservation.payment_status = "PENDING"
    reservation.payment_id = payment_id
    await db.commit()

    return PaymentInitResponse(
        reference_code=reservation.reference_code,
        gateway=gateway,
        mode=mode,  # type: ignore[arg-type]
        payment_id=payment_id,
        checkout_url=checkout_url,
        amount_bdt=amount_bdt,
        currency="BDT",
        merchant_invoice_no=merchant_invoice_no,
    )


async def verify_early_payment(
    db: AsyncSession,
    payload: PaymentVerifyRequest,
) -> PaymentVerifyResponse:
    reservation = await _load_reservation_by_ref(db, payload.reference_code)

    tx_stmt = (
        select(PaymentTransaction)
        .where(
            PaymentTransaction.reservation_id == reservation.id,
            PaymentTransaction.gateway_payment_id == payload.payment_id,
        )
        .order_by(PaymentTransaction.id.desc())
    )
    tx = (await db.execute(tx_stmt)).scalar_one_or_none()
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No payment transaction found for id {payload.payment_id}.",
        )

    # Idempotent early exit if already verified and credited
    if tx.status == "COMPLETED" or reservation.payment_status == "PAID":
        return PaymentVerifyResponse(
            reference_code=reservation.reference_code,
            gateway=payload.gateway,
            payment_status="PAID",
            payment_reference=reservation.payment_reference or tx.gateway_trx_id,
            paid_amount_bdt=reservation.paid_amount_bdt,
            already_processed=True,
            message="Payment was already verified.",
            reservation=serialize_reservation(reservation),
        )

    incoming_status = (payload.status or "").strip().lower()
    if incoming_status in ("cancel", "cancelled", "failure", "failed"):
        tx.status = "CANCELLED"
        reservation.payment_status = "UNPAID"
        await db.commit()
        reservation = await _load_reservation_by_ref(db, reservation.reference_code)
        return PaymentVerifyResponse(
            reference_code=reservation.reference_code,
            gateway=payload.gateway,
            payment_status="CANCELLED",
            message="Payment was cancelled or declined before capture. Your seat remains held.",
            reservation=serialize_reservation(reservation),
        )

    verified_trx_id: str | None = None
    verified_raw: dict[str, Any] = {}

    if tx.mode == "demo_simulation":
        if not settings.PAYMENT_ALLOW_DEMO_SIMULATION:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Demo simulation payments are disabled.",
            )
        prefix = "BKX" if payload.gateway == "bkash" else "CRD"
        verified_trx_id = f"{prefix}-{uuid.uuid4().hex[:8].upper()}"
        verified_raw = {"demo": True, "gateway": payload.gateway, "payment_id": payload.payment_id}
    elif payload.gateway == "bkash":
        result = await _execute_bkash_payment(payload.payment_id)
        verified_raw = result
        if result.get("transactionStatus") != "Completed":
            tx.status = "FAILED"
            tx.raw_payload = result
            reservation.payment_status = "PENDING"
            await db.commit()
            reservation = await _load_reservation_by_ref(db, reservation.reference_code)
            return PaymentVerifyResponse(
                reference_code=reservation.reference_code,
                gateway="bkash",
                payment_status="PENDING",
                message=result.get("statusMessage") or "bKash payment not completed yet.",
                reservation=serialize_reservation(reservation),
            )
        verified_trx_id = str(result.get("trxID") or payload.payment_id)
    else:
        session_data = await _retrieve_stripe_session(payload.payment_id)
        verified_raw = session_data
        if session_data.get("payment_status") != "paid":
            return PaymentVerifyResponse(
                reference_code=reservation.reference_code,
                gateway="card",
                payment_status="PENDING",
                message="Card checkout session is not marked paid yet.",
                reservation=serialize_reservation(reservation),
            )
        verified_trx_id = str(session_data.get("payment_intent") or payload.payment_id)

    now_utc = datetime.now(timezone.utc)
    tx.status = "COMPLETED"
    tx.gateway_trx_id = verified_trx_id
    tx.raw_payload = verified_raw

    reservation.payment_status = "PAID"
    reservation.payment_method = "BKASH" if payload.gateway == "bkash" else "CARD"
    reservation.payment_id = payload.payment_id
    reservation.payment_reference = verified_trx_id
    reservation.paid_amount_bdt = tx.amount_bdt
    reservation.paid_at = now_utc
    reservation.version += 1

    await db.commit()
    reservation = await _load_reservation_by_ref(db, reservation.reference_code)

    return PaymentVerifyResponse(
        reference_code=reservation.reference_code,
        gateway=payload.gateway,
        payment_status="PAID",
        payment_reference=verified_trx_id,
        paid_amount_bdt=tx.amount_bdt,
        already_processed=False,
        message="Early settlement confirmed. Priority seating unlocked.",
        reservation=serialize_reservation(reservation),
    )


async def _refund_bkash_payment(
    payment_id: str,
    trx_id: str,
    amount_bdt: Decimal,
    sku: str,
    reason: str,
) -> dict[str, Any]:
    return await _bkash_call(
        "/payment/refund",
        {
            "paymentID": payment_id,
            "trxID": trx_id,
            "amount": f"{amount_bdt:.2f}".rstrip("0").rstrip("."),
            "sku": sku,
            "reason": reason[:200],
        },
    )


async def _refund_stripe_payment(
    payment_intent_id: str,
    amount_bdt: Decimal,
    reason: str,
) -> dict[str, Any]:
    amount_minor = max(50, int((amount_bdt * 100).quantize(Decimal("1"))))
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/refunds",
            headers={"Authorization": f"Bearer {settings.STRIPE_SECRET_KEY.strip()}"},
            data={
                "payment_intent": payment_intent_id,
                "amount": str(amount_minor),
                "metadata[reason]": reason[:200],
            },
        )
    data = resp.json()
    if resp.status_code >= 400:
        err_msg = (data.get("error") or {}).get("message") or "Stripe refund request failed."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)
    return data


async def refund_early_payment(
    db: AsyncSession,
    reservation: Reservation,
    refund_amount_bdt: Decimal,
    reason: str,
) -> tuple[str | None, dict[str, Any]]:
    """Issue a full or partial refund through bKash, Stripe, or local demo ledger."""
    if refund_amount_bdt <= Decimal("0.00"):
        return None, {}

    charge_stmt = (
        select(PaymentTransaction)
        .where(
            PaymentTransaction.reservation_id == reservation.id,
            PaymentTransaction.transaction_type == "CHARGE",
            PaymentTransaction.status == "COMPLETED",
        )
        .order_by(PaymentTransaction.id.desc())
    )
    charge_tx = (await db.execute(charge_stmt)).scalar_one_or_none()

    gateway = charge_tx.gateway if charge_tx else (
        "bkash" if (reservation.payment_method or "").upper() == "BKASH" else "card"
    )
    mode = charge_tx.mode if charge_tx else (
        "demo_simulation" if settings.PAYMENT_ALLOW_DEMO_SIMULATION else "gateway"
    )
    refund_invoice = f"{reservation.reference_code}-REF-{uuid.uuid4().hex[:6].upper()}"
    refund_ref: str
    raw_payload: dict[str, Any] = {}

    if mode == "gateway" and gateway == "bkash" and bkash_is_configured():
        pay_id = str(charge_tx.gateway_payment_id or reservation.payment_id or "")
        trx_id = str(charge_tx.gateway_trx_id or reservation.payment_reference or "")
        raw_payload = await _refund_bkash_payment(
            payment_id=pay_id,
            trx_id=trx_id,
            amount_bdt=refund_amount_bdt,
            sku=reservation.reference_code,
            reason=reason,
        )
        refund_ref = str(raw_payload.get("refundTrxID") or raw_payload.get("trxID") or refund_invoice)
    elif mode == "gateway" and gateway == "card" and stripe_is_configured():
        pi_id = ""
        if charge_tx and isinstance(charge_tx.raw_payload, dict):
            pi_id = str(charge_tx.raw_payload.get("payment_intent") or "")
        pi_id = pi_id or str(
            (charge_tx.gateway_trx_id if charge_tx else None)
            or reservation.payment_reference
            or ""
        )
        raw_payload = await _refund_stripe_payment(
            payment_intent_id=pi_id,
            amount_bdt=refund_amount_bdt,
            reason=reason,
        )
        refund_ref = str(raw_payload.get("id") or refund_invoice)
    else:
        prefix = "BKX-REF" if gateway == "bkash" else "CRD-REF"
        refund_ref = f"{prefix}-{uuid.uuid4().hex[:8].upper()}"
        raw_payload = {
            "mode": mode,
            "gateway": gateway,
            "refund_amount_bdt": str(refund_amount_bdt),
            "reason": reason,
        }

    refund_tx = PaymentTransaction(
        reservation_id=reservation.id,
        gateway=gateway,
        transaction_type="REFUND",
        mode=mode,
        merchant_invoice_no=refund_invoice,
        gateway_payment_id=reservation.payment_id,
        gateway_trx_id=refund_ref,
        amount_bdt=refund_amount_bdt,
        currency="BDT",
        status="COMPLETED",
        raw_payload=raw_payload,
    )
    db.add(refund_tx)
    return refund_ref, raw_payload
