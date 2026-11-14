"""Add cancellation, no-show, and refund policy columns and release NO_SHOW from unique slot constraint.

Revision ID: 0003_cancellation_and_refund_policy
Revises: 0002_early_payment_fields
Create Date: 2026-11-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_cancellation_and_refund_policy"
down_revision: Union[str, None] = "0002_early_payment_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reservations",
        sa.Column(
            "refund_amount_bdt",
            sa.Numeric(precision=10, scale=2),
            server_default="0.00",
            nullable=False,
        ),
    )
    op.add_column(
        "reservations",
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "reservations",
        sa.Column("cancellation_reason", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "reservations",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "payment_transactions",
        sa.Column(
            "transaction_type",
            sa.String(length=16),
            server_default="CHARGE",
            nullable=False,
        ),
    )

    op.drop_index("uq_active_table_slot", table_name="reservations")
    op.create_index(
        "uq_active_table_slot",
        "reservations",
        ["table_id", "reservation_date", "time_slot"],
        unique=True,
        postgresql_where=sa.text("status NOT IN ('CANCELLED', 'NO_SHOW')"),
    )


def downgrade() -> None:
    op.drop_index("uq_active_table_slot", table_name="reservations")
    op.create_index(
        "uq_active_table_slot",
        "reservations",
        ["table_id", "reservation_date", "time_slot"],
        unique=True,
        postgresql_where=sa.text("status != 'CANCELLED'"),
    )
    op.drop_column("payment_transactions", "transaction_type")
    op.drop_column("reservations", "cancelled_at")
    op.drop_column("reservations", "cancellation_reason")
    op.drop_column("reservations", "refunded_at")
    op.drop_column("reservations", "refund_amount_bdt")
