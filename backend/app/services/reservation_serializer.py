from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.core.config import settings
from app.models.entities import Reservation
from app.schemas.hospitality import (
    CancellationPolicyPreview,
    ReservationItemOut,
    ReservationOut,
)

DHAKA_TZ = timezone(timedelta(hours=6))
RELEASED_RESERVATION_STATUSES = ("CANCELLED", "NO_SHOW")


def _parse_seating_datetime(reservation: Reservation) -> datetime:
    try:
        hour_str, min_str = reservation.time_slot.strip().split(":", 1)
        hour, minute = int(hour_str), int(min_str)
    except Exception:
        hour, minute = 20, 30
    return datetime(
        reservation.reservation_date.year,
        reservation.reservation_date.month,
        reservation.reservation_date.day,
        hour,
        minute,
        tzinfo=DHAKA_TZ,
    )


def compute_cancellation_policy(
    reservation: Reservation,
    now_utc: datetime | None = None,
) -> CancellationPolicyPreview:
    """Evaluate real-time refund & fee eligibility for cancellations and last-minute changes."""
    ref_now = (now_utc or datetime.now(timezone.utc)).astimezone(DHAKA_TZ)
    seating_dt = _parse_seating_datetime(reservation)
    hours_until = round((seating_dt - ref_now).total_seconds() / 3600.0, 2)

    paid = (
        Decimal(reservation.paid_amount_bdt)
        if reservation.payment_status == "PAID" and reservation.paid_amount_bdt
        else Decimal("0.00")
    )
    deposit_cap = Decimal(str(settings.TABLE_DEPOSIT_BDT))

    if reservation.status in ("SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"):
        reason_map = {
            "SEATED": "Guests are already seated and kitchen has fired your courses.",
            "COMPLETED": "This reservation has already concluded.",
            "CANCELLED": "This reservation was already cancelled.",
            "NO_SHOW": "Reservation was closed as a no-show after the 15-minute grace period.",
        }
        return CancellationPolicyPreview(
            can_cancel=False,
            policy_tier="NOT_CANCELLABLE",
            hours_until_seating=hours_until,
            estimated_refund_bdt=Decimal(reservation.refund_amount_bdt or "0.00"),
            forfeited_fee_bdt=max(Decimal("0.00"), paid - Decimal(reservation.refund_amount_bdt or "0.00"))
            if reservation.status in RELEASED_RESERVATION_STATUSES
            else Decimal("0.00"),
            policy_summary=reason_map.get(reservation.status, "Reservation cannot be cancelled."),
        )

    if paid <= Decimal("0.00"):
        return CancellationPolicyPreview(
            can_cancel=True,
            policy_tier="UNPAID_FREE_CANCEL",
            hours_until_seating=hours_until,
            estimated_refund_bdt=Decimal("0.00"),
            forfeited_fee_bdt=Decimal("0.00"),
            policy_summary="No advance charge was captured. Cancelling frees your table immediately with zero fee.",
        )

    if hours_until >= float(settings.FREE_CANCELLATION_HOURS):
        return CancellationPolicyPreview(
            can_cancel=True,
            policy_tier="FREE_FULL_REFUND",
            hours_until_seating=hours_until,
            estimated_refund_bdt=paid,
            forfeited_fee_bdt=Decimal("0.00"),
            policy_summary=(
                f"Cancelled with {settings.FREE_CANCELLATION_HOURS}+ hours notice: "
                "100% full refund returned to your original bKash or card account."
            ),
        )

    forfeit = min(paid, deposit_cap)
    refund = max(Decimal("0.00"), paid - forfeit)
    if refund > Decimal("0.00"):
        return CancellationPolicyPreview(
            can_cancel=True,
            policy_tier="LAST_MINUTE_PARTIAL",
            hours_until_seating=hours_until,
            estimated_refund_bdt=refund,
            forfeited_fee_bdt=forfeit,
            policy_summary=(
                f"Under {settings.FREE_CANCELLATION_HOURS} hours before seating: ৳ {int(forfeit):,} "
                f"table hold fee is retained, and ৳ {int(refund):,} in unfired pre-ordered courses "
                "is refunded automatically."
            ),
        )

    return CancellationPolicyPreview(
        can_cancel=True,
        policy_tier="LAST_MINUTE_FORFEIT",
        hours_until_seating=hours_until,
        estimated_refund_bdt=Decimal("0.00"),
        forfeited_fee_bdt=forfeit,
        policy_summary=(
            f"Under {settings.FREE_CANCELLATION_HOURS} hours before seating: the ৳ {int(forfeit):,} "
            "table reservation fee is non-refundable."
        ),
    )


def serialize_reservation(
    reservation: Reservation,
    now_utc: datetime | None = None,
) -> ReservationOut:
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
    pre_order_total = reservation.pre_order_total_bdt or Decimal("0.00")
    payable_amount = (
        pre_order_total
        if pre_order_total > Decimal("0.00")
        else Decimal(str(settings.TABLE_DEPOSIT_BDT))
    )
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
        pre_order_total_bdt=pre_order_total,
        payable_amount_bdt=payable_amount,
        payment_status=reservation.payment_status or "UNPAID",
        payment_method=reservation.payment_method,
        payment_reference=reservation.payment_reference,
        paid_amount_bdt=reservation.paid_amount_bdt or Decimal("0.00"),
        paid_at=reservation.paid_at,
        refund_amount_bdt=reservation.refund_amount_bdt or Decimal("0.00"),
        refunded_at=reservation.refunded_at,
        cancellation_reason=reservation.cancellation_reason,
        cancelled_at=reservation.cancelled_at,
        cancellation_policy=compute_cancellation_policy(reservation, now_utc=now_utc),
        version=reservation.version,
        created_at=reservation.created_at,
        items=items_out,
    )
