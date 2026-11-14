from __future__ import annotations

import secrets
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import (
    MenuItem,
    Reservation,
    ReservationItem,
    RestaurantTable,
)
from app.schemas.hospitality import ReservationConfirmRequest, ReservationItemOut, ReservationOut
from app.services.locks import clear_table_hold_after_confirm, verify_table_hold_owner


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


def serialize_reservation(reservation: Reservation) -> ReservationOut:
    items_out = [
        ReservationItemOut(
            id=item.id,
            menu_item_id=item.menu_item_id,
            dish_name=item.menu_item.name,
            dish_slug=item.menu_item.slug,
            image_url=item.menu_item.image_url,
            quantity=item.quantity,
            selected_modifiers=item.selected_modifiers,
            unit_price_bdt=item.unit_price_bdt,
        )
        for item in reservation.items
    ]
    return ReservationOut(
        id=reservation.id,
        reference_code=reservation.reference_code,
        table_code=reservation.table.table_code,
        zone_name=reservation.table.zone.name,
        zone_slug=reservation.table.zone.slug,
        guest_name=reservation.guest_name,
        guest_phone=reservation.guest_phone,
        party_size=reservation.party_size,
        reservation_date=reservation.reservation_date,
        time_slot=reservation.time_slot,
        status=reservation.status,  # type: ignore[arg-type]
        special_occasion=reservation.special_occasion,
        pre_order_total_bdt=reservation.pre_order_total_bdt,
        version=reservation.version,
        created_at=reservation.created_at,
        items=items_out,
    )


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
            Reservation.status != "CANCELLED",
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
