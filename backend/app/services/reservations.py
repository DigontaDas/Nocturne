from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.entities import (
    MenuItem,
    Reservation,
    ReservationItem,
    RestaurantTable,
)
from app.schemas.hospitality import (
    ReservationCancelRequest,
    ReservationConfirmRequest,
    ReservationLifecycleResponse,
    ReservationNoShowRequest,
    ReservationOut,
)
from app.services.locks import clear_table_hold_after_confirm, verify_table_hold_owner
from app.services.payments import refund_early_payment
from app.services.reservation_serializer import (
    DHAKA_TZ,
    RELEASED_RESERVATION_STATUSES,
    _parse_seating_datetime,
    compute_cancellation_policy,
    serialize_reservation,
)


def _generate_reference_code(year: int) -> str:
    digits = secrets.randbelow(9000) + 1000
    return f"NOC-{year}-{digits}"


def _compute_modifier_delta(menu_item: MenuItem, selected_modifiers: dict[str, Any]) -> Decimal:
    """Compute server-authoritative unit price delta from menu item customization_schema."""
    schema = menu_item.customization_schema or {}
    delta = Decimal("0.00")

    portion_key = selected_modifiers.get("portion")
    for option in schema.get("portions", []):
        if option.get("label") == portion_key or option.get("id") == portion_key:
            delta += Decimal(str(option.get("delta_bdt", 0)))
            break

    spice_key = selected_modifiers.get("spice")
    for option in schema.get("spice_levels", []):
        if option.get("label") == spice_key or option.get("id") == spice_key:
            delta += Decimal(str(option.get("delta_bdt", 0)))
            break

    selected_sides = selected_modifiers.get("sides") or []
    if isinstance(selected_sides, list):
        sides_map = {
            opt.get("id"): Decimal(str(opt.get("delta_bdt", 0)))
            for opt in schema.get("sides", [])
        }
        sides_label_map = {
            opt.get("label"): Decimal(str(opt.get("delta_bdt", 0)))
            for opt in schema.get("sides", [])
        }
        for side in selected_sides:
            if side in sides_map:
                delta += sides_map[side]
            elif side in sides_label_map:
                delta += sides_label_map[side]

    return delta


async def _load_reservation_full(db: AsyncSession, reference_code: str) -> Reservation:
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


async def confirm_reservation(
    db: AsyncSession,
    redis: Redis,
    payload: ReservationConfirmRequest,
) -> ReservationOut:
    """Phase 2 ACID reservation confirmation verifying Redis lock and PostgreSQL row lock."""
    table_code = payload.table_code.strip().upper()
    slot = payload.time_slot.strip()

    owns_lock = await verify_table_hold_owner(
        redis=redis,
        reservation_date=payload.reservation_date,
        time_slot=slot,
        table_code=table_code,
        session_id=payload.session_id,
    )
    if not owns_lock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Your 10-minute hold for table {table_code} at {slot} has expired "
                "or belongs to another guest. Please re-select an available table."
            ),
        )

    try:
        table_stmt = (
            select(RestaurantTable)
            .options(selectinload(RestaurantTable.zone))
            .where(RestaurantTable.table_code == table_code)
            .with_for_update()
        )
        table = (await db.execute(table_stmt)).scalar_one_or_none()
        if table is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Table {table_code} not found.",
            )

        if payload.party_size > table.capacity_max:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Table {table_code} seats up to {table.capacity_max} guests "
                    f"(requested {payload.party_size})."
                ),
            )

        conflict_stmt = select(Reservation.id).where(
            Reservation.table_id == table.id,
            Reservation.reservation_date == payload.reservation_date,
            Reservation.time_slot == slot,
            Reservation.status.notin_(RELEASED_RESERVATION_STATUSES),
        )
        existing_id = (await db.execute(conflict_stmt)).scalar_one_or_none()
        if existing_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Table {table_code} is already confirmed for {payload.reservation_date} at {slot}.",
            )

        menu_ids = [item.menu_item_id for item in payload.items]
        menu_map: dict[int, MenuItem] = {}
        if menu_ids:
            menu_rows = (
                await db.execute(select(MenuItem).where(MenuItem.id.in_(menu_ids)))
            ).scalars().all()
            menu_map = {m.id: m for m in menu_rows}
            missing = [mid for mid in menu_ids if mid not in menu_map]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Menu item(s) not found: {missing}",
                )

        # Generate collision-safe reference code
        ref_code = _generate_reference_code(payload.reservation_date.year)
        for _ in range(5):
            exists = (
                await db.execute(
                    select(Reservation.id).where(Reservation.reference_code == ref_code)
                )
            ).scalar_one_or_none()
            if exists is None:
                break
            ref_code = _generate_reference_code(payload.reservation_date.year)

        total_bdt = Decimal("0.00")
        reservation_items: list[ReservationItem] = []
        for item_in in payload.items:
            dish = menu_map[item_in.menu_item_id]
            delta = _compute_modifier_delta(dish, item_in.selected_modifiers)
            unit_price = max(Decimal("0.00"), Decimal(dish.base_price_bdt) + delta)
            total_bdt += unit_price * item_in.quantity
            reservation_items.append(
                ReservationItem(
                    menu_item_id=dish.id,
                    quantity=item_in.quantity,
                    selected_modifiers=item_in.selected_modifiers,
                    unit_price_bdt=unit_price,
                )
            )

        reservation = Reservation(
            reference_code=ref_code,
            table_id=table.id,
            guest_name=payload.guest_name.strip(),
            guest_phone=payload.guest_phone.strip(),
            party_size=payload.party_size,
            reservation_date=payload.reservation_date,
            time_slot=slot,
            status="CONFIRMED",
            special_occasion=payload.special_occasion.strip()
            if payload.special_occasion
            else None,
            pre_order_total_bdt=total_bdt,
            payment_status="PENDING" if payload.payment_method != "PAY_AT_VENUE" else "UNPAID",
            payment_method=payload.payment_method,
            version=1,
            items=reservation_items,
        )
        db.add(reservation)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Table {table_code} was just booked by another guest.",
        ) from exc
    except HTTPException:
        await db.rollback()
        raise

    await clear_table_hold_after_confirm(
        redis=redis,
        reservation_date=payload.reservation_date,
        time_slot=slot,
        table_code=table_code,
    )

    loaded_stmt = (
        select(Reservation)
        .options(
            selectinload(Reservation.table).selectinload(RestaurantTable.zone),
            selectinload(Reservation.items).selectinload(ReservationItem.menu_item),
        )
        .where(Reservation.id == reservation.id)
    )
    loaded = (await db.execute(loaded_stmt)).scalar_one()
    return serialize_reservation(loaded)


async def lookup_reservations(
    db: AsyncSession,
    phone: str | None = None,
    reference_code: str | None = None,
) -> list[ReservationOut]:
    stmt = (
        select(Reservation)
        .options(
            selectinload(Reservation.table).selectinload(RestaurantTable.zone),
            selectinload(Reservation.items).selectinload(ReservationItem.menu_item),
        )
        .order_by(Reservation.created_at.desc())
        .limit(10)
    )
    if reference_code and reference_code.strip():
        stmt = stmt.where(Reservation.reference_code == reference_code.strip().upper())
    elif phone and phone.strip():
        digits = "".join(ch for ch in phone if ch.isdigit())
        suffix = digits[-8:] if len(digits) >= 8 else digits
        if suffix:
            stmt = stmt.where(Reservation.guest_phone.contains(suffix))
        else:
            stmt = stmt.where(Reservation.guest_phone == phone.strip())
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a reservation reference code or guest phone number.",
        )
    rows = (await db.execute(stmt)).scalars().all()
    return [serialize_reservation(r) for r in rows]


def _normalize_digits(raw: str | None) -> str:
    return "".join(ch for ch in (raw or "") if ch.isdigit())


async def cancel_reservation(
    db: AsyncSession,
    redis: Redis,
    reference_code: str,
    payload: ReservationCancelRequest,
    now_utc: datetime | None = None,
) -> ReservationLifecycleResponse:
    """Cancel an active reservation, apply refund policy, and release the table immediately."""
    reservation = await _load_reservation_full(db, reference_code)

    if payload.guest_phone and payload.guest_phone.strip():
        supplied = _normalize_digits(payload.guest_phone)
        stored = _normalize_digits(reservation.guest_phone)
        if not supplied or (not stored.endswith(supplied[-8:]) and supplied != stored):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Phone number does not match the primary guest on this booking.",
            )

    if reservation.status == "CANCELLED":
        return ReservationLifecycleResponse(
            message="Reservation was already cancelled; no additional change made.",
            refund_amount_bdt=reservation.refund_amount_bdt or Decimal("0.00"),
            forfeited_fee_bdt=max(
                Decimal("0.00"),
                (reservation.paid_amount_bdt or Decimal("0.00"))
                - (reservation.refund_amount_bdt or Decimal("0.00")),
            )
            if reservation.payment_status in ("REFUNDED", "PARTIALLY_REFUNDED", "FORFEITED")
            else Decimal("0.00"),
            table_released=True,
            reservation=serialize_reservation(reservation, now_utc=now_utc),
        )

    if reservation.status in ("SEATED", "COMPLETED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Guests are already seated and courses have been fired. Speak with the Maître d' at the podium.",
        )

    if reservation.status == "NO_SHOW":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reservation was already marked as a no-show after the grace period.",
        )

    now = now_utc or datetime.now(timezone.utc)
    policy = compute_cancellation_policy(reservation, now_utc=now)
    refund_bdt = policy.estimated_refund_bdt
    forfeit_bdt = policy.forfeited_fee_bdt
    paid_bdt = (
        Decimal(reservation.paid_amount_bdt)
        if reservation.payment_status == "PAID" and reservation.paid_amount_bdt
        else Decimal("0.00")
    )

    reason_text = (payload.reason or "Cancelled by guest").strip()
    if paid_bdt > Decimal("0.00"):
        if refund_bdt > Decimal("0.00"):
            await refund_early_payment(
                db=db,
                reservation=reservation,
                refund_amount_bdt=refund_bdt,
                reason=reason_text,
            )
            reservation.payment_status = (
                "PARTIALLY_REFUNDED" if forfeit_bdt > Decimal("0.00") else "REFUNDED"
            )
            reservation.refund_amount_bdt = refund_bdt
            reservation.refunded_at = now
        else:
            reservation.payment_status = "FORFEITED"
            reservation.refund_amount_bdt = Decimal("0.00")

    reservation.status = "CANCELLED"
    reservation.cancelled_at = now
    reservation.cancellation_reason = reason_text
    reservation.version += 1

    await db.commit()
    try:
        await clear_table_hold_after_confirm(
            redis=redis,
            reservation_date=reservation.reservation_date,
            time_slot=reservation.time_slot,
            table_code=reservation.table.table_code,
        )
    except Exception:
        pass

    reloaded = await _load_reservation_full(db, reservation.reference_code)
    return ReservationLifecycleResponse(
        message=(
            f"Reservation cancelled and table {reloaded.table.table_code} released. "
            + (
                f"৳ {int(refund_bdt):,} refunded."
                if refund_bdt > Decimal("0.00")
                else ("Table deposit forfeited per last-minute policy." if forfeit_bdt > Decimal("0.00") else "Zero fee charged.")
            )
        ),
        refund_amount_bdt=refund_bdt,
        forfeited_fee_bdt=forfeit_bdt,
        table_released=True,
        reservation=serialize_reservation(reloaded, now_utc=now),
    )


async def mark_reservation_no_show(
    db: AsyncSession,
    redis: Redis,
    reference_code: str,
    payload: ReservationNoShowRequest,
    now_utc: datetime | None = None,
) -> ReservationLifecycleResponse:
    """Release an unclaimed table after the 15-minute grace window and settle deposit/pre-order."""
    reservation = await _load_reservation_full(db, reference_code)

    if reservation.status == "NO_SHOW":
        return ReservationLifecycleResponse(
            message="Reservation was already marked as a no-show; table is released.",
            refund_amount_bdt=reservation.refund_amount_bdt or Decimal("0.00"),
            forfeited_fee_bdt=max(
                Decimal("0.00"),
                (reservation.paid_amount_bdt or Decimal("0.00"))
                - (reservation.refund_amount_bdt or Decimal("0.00")),
            )
            if reservation.payment_status in ("PARTIALLY_REFUNDED", "FORFEITED")
            else Decimal("0.00"),
            table_released=True,
            reservation=serialize_reservation(reservation, now_utc=now_utc),
        )

    if reservation.status in ("SEATED", "COMPLETED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot mark a seated or completed party as no-show.",
        )

    if reservation.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reservation was already cancelled prior to seating.",
        )

    now = (now_utc or datetime.now(timezone.utc)).astimezone(DHAKA_TZ)
    seating_dt = _parse_seating_datetime(reservation)
    minutes_past = (now - seating_dt).total_seconds() / 60.0
    if not payload.host_override and minutes_past < float(settings.NO_SHOW_GRACE_MINUTES):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Table remains protected inside the {settings.NO_SHOW_GRACE_MINUTES}-minute arrival grace period. "
                "Use host override if the guest confirmed they will not attend."
            ),
        )

    paid_bdt = (
        Decimal(reservation.paid_amount_bdt)
        if reservation.payment_status == "PAID" and reservation.paid_amount_bdt
        else Decimal("0.00")
    )
    deposit_cap = Decimal(str(settings.TABLE_DEPOSIT_BDT))
    forfeit_bdt = min(paid_bdt, deposit_cap) if paid_bdt > Decimal("0.00") else Decimal("0.00")
    refund_bdt = max(Decimal("0.00"), paid_bdt - forfeit_bdt)

    note_text = (payload.note or "Guest did not arrive within 15-minute grace window").strip()
    if paid_bdt > Decimal("0.00"):
        if refund_bdt > Decimal("0.00"):
            await refund_early_payment(
                db=db,
                reservation=reservation,
                refund_amount_bdt=refund_bdt,
                reason=f"No-show unfired pre-order balance refund ({note_text})",
            )
            reservation.payment_status = "PARTIALLY_REFUNDED"
            reservation.refund_amount_bdt = refund_bdt
            reservation.refunded_at = now
        else:
            reservation.payment_status = "FORFEITED"
            reservation.refund_amount_bdt = Decimal("0.00")

    reservation.status = "NO_SHOW"
    reservation.cancelled_at = now
    reservation.cancellation_reason = note_text
    reservation.version += 1

    await db.commit()
    try:
        await clear_table_hold_after_confirm(
            redis=redis,
            reservation_date=reservation.reservation_date,
            time_slot=reservation.time_slot,
            table_code=reservation.table.table_code,
        )
    except Exception:
        pass

    reloaded = await _load_reservation_full(db, reservation.reference_code)
    return ReservationLifecycleResponse(
        message=(
            f"Marked {reloaded.table.table_code} as No-Show and opened seat for walk-ins. "
            + (
                f"৳ {int(forfeit_bdt):,} table fee retained; ৳ {int(refund_bdt):,} unfired pre-order balance refunded."
                if refund_bdt > Decimal("0.00")
                else (
                    f"৳ {int(forfeit_bdt):,} table deposit forfeited."
                    if forfeit_bdt > Decimal("0.00")
                    else "Seat released with zero charge."
                )
            )
        ),
        refund_amount_bdt=refund_bdt,
        forfeited_fee_bdt=forfeit_bdt,
        table_released=True,
        reservation=serialize_reservation(reloaded, now_utc=now),
    )
