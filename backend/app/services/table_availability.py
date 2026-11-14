from __future__ import annotations

from datetime import date

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import DiningZone, Reservation, RestaurantTable
from app.schemas.hospitality import TableOut
from app.services.locks import get_slot_locks


async def fetch_tables_with_status(
    db: AsyncSession,
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    zone_slug: str | None = None,
    caller_session: str | None = None,
) -> list[TableOut]:
    """Query all dining tables and merge PostgreSQL bookings + Redis holds."""
    stmt = (
        select(RestaurantTable)
        .options(selectinload(RestaurantTable.zone))
        .order_by(RestaurantTable.table_code)
    )
    if zone_slug:
        stmt = stmt.join(DiningZone).where(DiningZone.slug == zone_slug.strip())

    tables = (await db.execute(stmt)).scalars().all()
    if not tables:
        return []

    booked_rows = (
        await db.execute(
            select(Reservation.table_id).where(
                Reservation.reservation_date == reservation_date,
                Reservation.time_slot == time_slot.strip(),
                Reservation.status.notin_(("CANCELLED", "NO_SHOW")),
            )
        )
    ).scalars().all()
    booked_ids = set(booked_rows)

    try:
        locks = await get_slot_locks(
            redis=redis,
            reservation_date=reservation_date,
            time_slot=time_slot,
            table_codes=[t.table_code for t in tables],
        )
    except Exception:
        locks = {}

    output: list[TableOut] = []
    for table in tables:
        code_upper = table.table_code.upper()
        hold_ttl: int | None = None
        if table.id in booked_ids:
            table_status = "BOOKED"
        elif code_upper in locks:
            holder_id, ttl_sec = locks[code_upper]
            hold_ttl = ttl_sec
            table_status = (
                "HELD_BY_YOU"
                if caller_session and holder_id == caller_session
                else "HELD_BY_OTHERS"
            )
        else:
            table_status = "AVAILABLE"

        output.append(
            TableOut(
                id=table.id,
                table_code=table.table_code,
                zone_id=table.zone_id,
                zone_slug=table.zone.slug,
                zone_name=table.zone.name,
                capacity_min=table.capacity_min,
                capacity_max=table.capacity_max,
                shape=table.shape,  # type: ignore[arg-type]
                svg_x=table.svg_x,
                svg_y=table.svg_y,
                svg_rotation=table.svg_rotation,
                is_window_side=table.is_window_side,
                is_quiet_zone=table.is_quiet_zone,
                noise_db=table.noise_db,
                perspective_photo_url=table.perspective_photo_url,
                vibe_notes=table.vibe_notes,
                status=table_status,  # type: ignore[arg-type]
                hold_ttl_seconds=hold_ttl,
            )
        )
    return output
