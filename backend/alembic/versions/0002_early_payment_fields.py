"""Add early payment fields to reservations and payment_transactions table.

Revision ID: 0002_early_payment_fields
Revises: 0001_initial_schema
Create Date: 2026-11-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_early_payment_fields"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reservations",
        sa.Column(
            "payment_status",
            sa.String(length=24),
            server_default="UNPAID",
            nullable=False,
        ),
    )
    op.add_column(
        "reservations",
        sa.Column("payment_method", sa.String(length=24), nullable=True),
    )
    op.add_column(
        "reservations",
        sa.Column("payment_id", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "reservations",
        sa.Column("payment_reference", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "reservations",
        sa.Column(
            "paid_amount_bdt",
            sa.Numeric(precision=10, scale=2),
            server_default="0.00",
            nullable=False,
        ),
    )
    op.add_column(
        "reservations",
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_reservations_payment_id"),
        "reservations",
        ["payment_id"],
        unique=False,
    )

    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("gateway", sa.String(length=24), nullable=False),
        sa.Column(
            "mode",
            sa.String(length=24),
            server_default="gateway",
            nullable=False,
        ),
        sa.Column("merchant_invoice_no", sa.String(length=64), nullable=False),
        sa.Column("gateway_payment_id", sa.String(length=128), nullable=True),
        sa.Column("gateway_trx_id", sa.String(length=128), nullable=True),
        sa.Column("amount_bdt", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            "currency",
            sa.String(length=8),
            server_default="BDT",
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=24),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["reservation_id"], ["reservations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_payment_transactions_gateway_payment_id"),
        "payment_transactions",
        ["gateway_payment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_transactions_merchant_invoice_no"),
        "payment_transactions",
        ["merchant_invoice_no"],
        unique=True,
    )
    op.create_index(
        op.f("ix_payment_transactions_reservation_id"),
        "payment_transactions",
        ["reservation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_payment_transactions_reservation_id"),
        table_name="payment_transactions",
    )
    op.drop_index(
        op.f("ix_payment_transactions_merchant_invoice_no"),
        table_name="payment_transactions",
    )
    op.drop_index(
        op.f("ix_payment_transactions_gateway_payment_id"),
        table_name="payment_transactions",
    )
    op.drop_table("payment_transactions")
    op.drop_index(op.f("ix_reservations_payment_id"), table_name="reservations")
    op.drop_column("reservations", "paid_at")
    op.drop_column("reservations", "paid_amount_bdt")
    op.drop_column("reservations", "payment_reference")
    op.drop_column("reservations", "payment_id")
    op.drop_column("reservations", "payment_method")
    op.drop_column("reservations", "payment_status")
