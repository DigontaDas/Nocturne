from datetime import date

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.redis import get_redis
from app.db.session import get_db
from app.models.entities import DiningZone, Reservation
from app.schemas.hospitality import DiningZoneOut
from app.services.locks import get_slot_locks

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("", response_model=list[DiningZoneOut])
async def list_zones(
    reservation_date: date | None = Query(default=None, alias="date"),
    time_slot: str = Query(default="20:30"),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> list[DiningZoneOut]:
    """Return all dining zones with optional real-time table availability counts."""
    zones = (
        await db.execute(
            select(DiningZone)
            .options(selectinload(DiningZone.tables))
            .order_by(DiningZone.id)
        )
    ).scalars().all()

    booked_table_ids: set[int] = set()
    active_locks: dict[str, tuple[str, int]] = {}
    if reservation_date is not None:
        all_codes = [t.table_code for z in zones for t in z.tables]
        booked_rows = (
            await db.execute(
                select(Reservation.table_id).where(
                    Reservation.reservation_date == reservation_date,
                    Reservation.time_slot == time_slot.strip(),
                    Reservation.status != "CANCELLED",
                )
            )
        ).scalars().all()
        booked_table_ids = set(booked_rows)
        try:
            active_locks = await get_slot_locks(redis, reservation_date, time_slot, all_codes)
        except Exception:
            active_locks = {}

    results: list[DiningZoneOut] = []
    for zone in zones:
        total = len(zone.tables)
        if reservation_date is None:
            avail = total
        else:
            avail = sum(
                1
                for t in zone.tables
                if t.id not in booked_table_ids and t.table_code.upper() not in active_locks
            )
        results.append(
            DiningZoneOut(
                id=zone.id,
                slug=zone.slug,
                name=zone.name,
                ambient_noise_db=zone.ambient_noise_db,
                vibe_tagline=zone.vibe_tagline,
                description=zone.description,
                preview_image_url=zone.preview_image_url,
                preview_video_url=zone.preview_video_url,
                table_count=total,
                available_count=avail,
            )
        )
    return results
