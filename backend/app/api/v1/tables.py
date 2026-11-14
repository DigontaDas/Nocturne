from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis
from app.db.session import get_db
from app.models.entities import Reservation, RestaurantTable
from app.schemas.hospitality import (
    TableHoldRequest,
    TableHoldResponse,
    TableOut,
    TableReleaseRequest,
)
from app.services.locks import acquire_table_hold, release_table_hold
from app.services.table_availability import fetch_tables_with_status

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("", response_model=list[TableOut])
async def list_tables(
    reservation_date: date = Query(default_factory=date.today, alias="date"),
    time_slot: str = Query(default="20:30"),
    zone: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> list[TableOut]:
    """List tables with real-time PostgreSQL booking and Redis hold statuses."""
    return await fetch_tables_with_status(
        db=db,
        redis=redis,
        reservation_date=reservation_date,
        time_slot=time_slot,
        zone_slug=zone,
        caller_session=session_id or x_session_id,
    )


@router.post("/{table_code}/hold", response_model=TableHoldResponse)
async def hold_table(
    table_code: str,
    payload: TableHoldRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TableHoldResponse:
    """Phase 1: Acquire an atomic 10-minute Redis seat hold (`SET ... NX EX 600`)."""
    code = table_code.strip().upper()
    slot = payload.time_slot.strip()

    table = (
        await db.execute(
            select(RestaurantTable).where(RestaurantTable.table_code == code)
        )
    ).scalar_one_or_none()
    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table {code} does not exist.",
        )

    if payload.party_size is not None and payload.party_size > table.capacity_max:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Table {code} accommodates up to {table.capacity_max} guests.",
        )

    existing_booking = (
        await db.execute(
            select(Reservation.id).where(
                Reservation.table_id == table.id,
                Reservation.reservation_date == payload.reservation_date,
                Reservation.time_slot == slot,
                Reservation.status != "CANCELLED",
            )
        )
    ).scalar_one_or_none()
    if existing_booking is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Table {code} is already booked for {payload.reservation_date} at {slot}.",
        )

    hold = await acquire_table_hold(
        redis=redis,
        reservation_date=payload.reservation_date,
        time_slot=slot,
        table_code=code,
        session_id=payload.session_id,
    )
    if not hold.acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Table {code} is currently held by another guest.",
                "table_code": code,
                "ttl_seconds": hold.ttl_seconds,
            },
        )

    return TableHoldResponse(
        table_code=code,
        reservation_date=payload.reservation_date,
        time_slot=slot,
        session_id=payload.session_id,
        status="HELD_BY_YOU",
        ttl_seconds=hold.ttl_seconds,
        expires_at=hold.expires_at,
    )


@router.delete("/{table_code}/hold")
async def release_hold(
    table_code: str,
    payload: TableReleaseRequest,
    redis: Redis = Depends(get_redis),
) -> dict[str, object]:
    """Release a caller-owned Redis hold early when switching tables."""
    code = table_code.strip().upper()
    released = await release_table_hold(
        redis=redis,
        reservation_date=payload.reservation_date,
        time_slot=payload.time_slot.strip(),
        table_code=code,
        session_id=payload.session_id,
    )
    return {"table_code": code, "released": released}
