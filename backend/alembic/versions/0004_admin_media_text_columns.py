"""Expand table perspective photo and menu item image URL columns to Text for admin uploads.

Revision ID: 0004_admin_media_text_columns
Revises: 0003_cancellation_and_refund_policy
Create Date: 2026-11-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_admin_media_text_columns"
down_revision: Union[str, None] = "0003_cancellation_and_refund_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("restaurant_tables") as batch_op:
        batch_op.alter_column(
            "perspective_photo_url",
            existing_type=sa.String(length=500),
            type_=sa.Text(),
            existing_nullable=False,
        )
    with op.batch_alter_table("menu_items") as batch_op:
        batch_op.alter_column(
            "image_url",
            existing_type=sa.String(length=500),
            type_=sa.Text(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("menu_items") as batch_op:
        batch_op.alter_column(
            "image_url",
            existing_type=sa.Text(),
            type_=sa.String(length=500),
            existing_nullable=False,
        )
    with op.batch_alter_table("restaurant_tables") as batch_op:
        batch_op.alter_column(
            "perspective_photo_url",
            existing_type=sa.Text(),
            type_=sa.String(length=500),
            existing_nullable=False,
        )
