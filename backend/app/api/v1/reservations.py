from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.redis import get_redis
from app.db.session import get_db
from app.models.entities import Reservation, ReservationItem, RestaurantTable
from app.schemas.hospitality import (
    ReservationCancelRequest,
    ReservationConfirmRequest,
    ReservationLifecycleResponse,
    ReservationNoShowRequest,
    ReservationOut,
)
from app.services.reservations import (
    cancel_reservation,
    confirm_reservation,
    lookup_reservations,
    mark_reservation_no_show,
    serialize_reservation,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get("", response_model=list[ReservationOut])
async def find_reservations(
    phone: str | None = Query(default=None),
    reference_code: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[ReservationOut]:
    """Look up reservations by reference code or guest phone number."""
    return await lookup_reservations(db=db, phone=phone, reference_code=reference_code)


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
    """Host-stand guest arrival transition (CONFIRMED -> SEATED -> COMPLETED)."""
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

    if reservation.status in ("CANCELLED", "NO_SHOW"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Reservation {code} was released ({reservation.status}) and cannot be checked in.",
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


@router.post("/{reference_code}/cancel", response_model=ReservationLifecycleResponse)
async def cancel_booking(
    reference_code: str,
    payload: ReservationCancelRequest = Body(default_factory=ReservationCancelRequest),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ReservationLifecycleResponse:
    """Cancel reservation, enforce 4-hour refund tier policy, and free the table immediately."""
    return await cancel_reservation(
        db=db,
        redis=redis,
        reference_code=reference_code,
        payload=payload,
    )


@router.post("/{reference_code}/no-show", response_model=ReservationLifecycleResponse)
async def mark_booking_no_show(
    reference_code: str,
    payload: ReservationNoShowRequest = Body(default_factory=ReservationNoShowRequest),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ReservationLifecycleResponse:
    """Mark unclaimed booking as NO_SHOW after grace window, forfeit deposit, refund surplus, release seat."""
    return await mark_reservation_no_show(
        db=db,
        redis=redis,
        reference_code=reference_code,
        payload=payload,
    )
