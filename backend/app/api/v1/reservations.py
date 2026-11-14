from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.redis import get_redis
from app.db.session import get_db
from app.models.entities import Reservation, ReservationItem, RestaurantTable
from app.schemas.hospitality import ReservationConfirmRequest, ReservationOut
from app.services.reservations import confirm_reservation, serialize_reservation

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.post("/confirm", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
async def confirm_booking(
    payload: ReservationConfirmRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ReservationOut:
    """Phase 2: Confirm a held table with ACID PostgreSQL lock and release Redis TTL."""
    return await confirm_reservation(db=db, redis=redis, payload=payload)


@router.get("/{reference_code}", response_model=ReservationOut)
async def get_reservation(
    reference_code: str,
    db: AsyncSession = Depends(get_db),
) -> ReservationOut:
    """Fetch full reservation and pre-ordered dishes by reference code."""
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
    return serialize_reservation(reservation)


@router.post("/{reference_code}/check-in", response_model=ReservationOut)
async def host_check_in(
    reference_code: str,
    db: AsyncSession = Depends(get_db),
) -> ReservationOut:
    """Simulate host-stand guest check-in lifecycle (CONFIRMED -> SEATED -> COMPLETED)."""
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

    transitions = {
        "HELD": "CONFIRMED",
        "CONFIRMED": "SEATED",
        "SEATED": "COMPLETED",
    }
    if reservation.status in transitions:
        reservation.status = transitions[reservation.status]
        reservation.version += 1
        await db.commit()
        await db.refresh(reservation)

    return serialize_reservation(reservation)
