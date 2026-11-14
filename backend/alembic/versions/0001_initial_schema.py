"""Initial Nocturne schema with pgvector and partial reservation index.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "dining_zones",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("ambient_noise_db", sa.Integer(), nullable=False),
        sa.Column("vibe_tagline", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("preview_image_url", sa.String(length=500), nullable=False),
        sa.Column("preview_video_url", sa.String(length=500), server_default="", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dining_zones_slug"), "dining_zones", ["slug"], unique=True)

    op.create_table(
        "restaurant_tables",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("table_code", sa.String(length=16), nullable=False),
        sa.Column("zone_id", sa.Integer(), nullable=False),
        sa.Column("capacity_min", sa.Integer(), nullable=False),
        sa.Column("capacity_max", sa.Integer(), nullable=False),
        sa.Column("shape", sa.String(length=24), nullable=False),
        sa.Column("svg_x", sa.Float(), nullable=False),
        sa.Column("svg_y", sa.Float(), nullable=False),
        sa.Column("svg_rotation", sa.Float(), nullable=False),
        sa.Column("is_window_side", sa.Boolean(), nullable=False),
        sa.Column("is_quiet_zone", sa.Boolean(), nullable=False),
        sa.Column("noise_db", sa.Integer(), nullable=False),
        sa.Column("perspective_photo_url", sa.String(length=500), nullable=False),
        sa.Column("vibe_notes", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["zone_id"], ["dining_zones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_restaurant_tables_table_code"), "restaurant_tables", ["table_code"], unique=True)
    op.create_index(op.f("ix_restaurant_tables_zone_id"), "restaurant_tables", ["zone_id"], unique=False)

    op.create_table(
        "menu_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("base_price_bdt", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("calories_kcal", sa.Integer(), nullable=False),
        sa.Column("protein_grams", sa.Integer(), nullable=False),
        sa.Column("prep_time_mins", sa.Integer(), nullable=False),
        sa.Column("spice_level", sa.Integer(), nullable=False),
        sa.Column("is_dairy_free", sa.Boolean(), nullable=False),
        sa.Column("is_nut_free", sa.Boolean(), nullable=False),
        sa.Column("is_gluten_free", sa.Boolean(), nullable=False),
        sa.Column("is_signature", sa.Boolean(), nullable=False),
        sa.Column("allergen_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("customization_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_menu_items_category"), "menu_items", ["category"], unique=False)
    op.create_index(op.f("ix_menu_items_slug"), "menu_items", ["slug"], unique=True)

    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reference_code", sa.String(length=32), nullable=False),
        sa.Column("table_id", sa.Integer(), nullable=False),
        sa.Column("guest_name", sa.String(length=120), nullable=False),
        sa.Column("guest_phone", sa.String(length=32), nullable=False),
        sa.Column("party_size", sa.Integer(), nullable=False),
        sa.Column("reservation_date", sa.Date(), nullable=False),
        sa.Column("time_slot", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("special_occasion", sa.String(length=120), nullable=True),
        sa.Column("pre_order_total_bdt", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["restaurant_tables.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reservations_reference_code"), "reservations", ["reference_code"], unique=True)
    op.create_index(op.f("ix_reservations_reservation_date"), "reservations", ["reservation_date"], unique=False)
    op.create_index(op.f("ix_reservations_table_id"), "reservations", ["table_id"], unique=False)
    op.create_index(op.f("ix_reservations_time_slot"), "reservations", ["time_slot"], unique=False)
    op.create_index(
        "uq_active_table_slot",
        "reservations",
        ["table_id", "reservation_date", "time_slot"],
        unique=True,
        postgresql_where=sa.text("status != 'CANCELLED'"),
    )

    op.create_table(
        "reservation_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("menu_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("selected_modifiers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("unit_price_bdt", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["menu_item_id"], ["menu_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reservation_items_reservation_id"), "reservation_items", ["reservation_id"], unique=False)

    op.create_table(
        "culinary_knowledge_chunks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("doc_title", sa.String(length=200), nullable=False),
        sa.Column("source_filename", sa.String(length=150), nullable=False),
        sa.Column("section_ref", sa.String(length=64), nullable=False),
        sa.Column("dish_slug", sa.String(length=100), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("content_tsv", postgresql.TSVECTOR(), nullable=True),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_culinary_knowledge_chunks_dish_slug"), "culinary_knowledge_chunks", ["dish_slug"], unique=False)
    op.create_index(op.f("ix_culinary_knowledge_chunks_doc_title"), "culinary_knowledge_chunks", ["doc_title"], unique=False)
    op.create_index("ix_knowledge_tsv", "culinary_knowledge_chunks", ["content_tsv"], unique=False, postgresql_using="gin")
    op.create_index(
        "ix_knowledge_embedding_hnsw",
        "culinary_knowledge_chunks",
        ["embedding"],
        unique=False,
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_knowledge_embedding_hnsw", table_name="culinary_knowledge_chunks")
    op.drop_index("ix_knowledge_tsv", table_name="culinary_knowledge_chunks")
    op.drop_index(op.f("ix_culinary_knowledge_chunks_doc_title"), table_name="culinary_knowledge_chunks")
    op.drop_index(op.f("ix_culinary_knowledge_chunks_dish_slug"), table_name="culinary_knowledge_chunks")
    op.drop_table("culinary_knowledge_chunks")
    op.drop_index(op.f("ix_reservation_items_reservation_id"), table_name="reservation_items")
    op.drop_table("reservation_items")
    op.drop_index("uq_active_table_slot", table_name="reservations")
    op.drop_index(op.f("ix_reservations_time_slot"), table_name="reservations")
    op.drop_index(op.f("ix_reservations_table_id"), table_name="reservations")
    op.drop_index(op.f("ix_reservations_reservation_date"), table_name="reservations")
    op.drop_index(op.f("ix_reservations_reference_code"), table_name="reservations")
    op.drop_table("reservations")
    op.drop_index(op.f("ix_menu_items_slug"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_category"), table_name="menu_items")
    op.drop_table("menu_items")
    op.drop_index(op.f("ix_restaurant_tables_zone_id"), table_name="restaurant_tables")
    op.drop_index(op.f("ix_restaurant_tables_table_code"), table_name="restaurant_tables")
    op.drop_table("restaurant_tables")
    op.drop_index(op.f("ix_dining_zones_slug"), table_name="dining_zones")
    op.drop_table("dining_zones")
