from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.hospitality import (
    PaymentConfigOut,
    PaymentInitRequest,
    PaymentInitResponse,
    PaymentVerifyRequest,
    PaymentVerifyResponse,
)
from app.services.payments import (
    get_payment_config,
    initiate_early_payment,
    verify_early_payment,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/config", response_model=PaymentConfigOut)
async def payment_gateway_config() -> PaymentConfigOut:
    """Expose configured status (gateway vs demo_simulation) for bKash and Card payments."""
    return get_payment_config()


@router.post("/init", response_model=PaymentInitResponse)
async def init_payment(
    payload: PaymentInitRequest,
    db: AsyncSession = Depends(get_db),
) -> PaymentInitResponse:
    """Initialize bKash Tokenized Checkout or Stripe Card Checkout for a reservation."""
    return await initiate_early_payment(db=db, payload=payload)


@router.post("/verify", response_model=PaymentVerifyResponse)
async def verify_payment(
    payload: PaymentVerifyRequest,
    db: AsyncSession = Depends(get_db),
) -> PaymentVerifyResponse:
    """Idempotently execute & verify a bKash or Card checkout return callback."""
    return await verify_early_payment(db=db, payload=payload)
