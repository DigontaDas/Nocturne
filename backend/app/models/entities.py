from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


JSONVariant = JSON().with_variant(JSONB(), "postgresql")
TSVectorVariant = Text().with_variant(TSVECTOR(), "postgresql")
VectorVariant = JSON().with_variant(Vector(384), "postgresql")


class Base(DeclarativeBase):
    """Declarative base for all Nocturne SQLAlchemy models."""


class DiningZone(Base):
    __tablename__ = "dining_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    ambient_noise_db: Mapped[int] = mapped_column(Integer, nullable=False)
    vibe_tagline: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    preview_image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    preview_video_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    tables: Mapped[list[RestaurantTable]] = relationship(
        back_populates="zone",
        cascade="all, delete-orphan",
        order_by="RestaurantTable.table_code",
    )


class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    table_code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    zone_id: Mapped[int] = mapped_column(
        ForeignKey("dining_zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    capacity_min: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity_max: Mapped[int] = mapped_column(Integer, nullable=False)
    shape: Mapped[str] = mapped_column(String(24), nullable=False)
    svg_x: Mapped[float] = mapped_column(Float, nullable=False)
    svg_y: Mapped[float] = mapped_column(Float, nullable=False)
    svg_rotation: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_window_side: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_quiet_zone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    noise_db: Mapped[int] = mapped_column(Integer, nullable=False, default=52)
    perspective_photo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    vibe_notes: Mapped[str] = mapped_column(Text, nullable=False)

    zone: Mapped[DiningZone] = relationship(back_populates="tables")
    reservations: Mapped[list[Reservation]] = relationship(back_populates="table")


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    base_price_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    calories_kcal: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_grams: Mapped[int] = mapped_column(Integer, nullable=False)
    prep_time_mins: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    spice_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_dairy_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_nut_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_gluten_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_signature: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allergen_flags: Mapped[list[str]] = mapped_column(JSONVariant, nullable=False, default=list)
    customization_schema: Mapped[dict[str, Any]] = mapped_column(
        JSONVariant, nullable=False, default=dict
    )
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (
        Index(
            "uq_active_table_slot",
            "table_id",
            "reservation_date",
            "time_slot",
            unique=True,
            postgresql_where=text("status != 'CANCELLED'"),
            sqlite_where=text("status != 'CANCELLED'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    table_id: Mapped[int] = mapped_column(
        ForeignKey("restaurant_tables.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    guest_name: Mapped[str] = mapped_column(String(120), nullable=False)
    guest_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    reservation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    time_slot: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="CONFIRMED")
    special_occasion: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pre_order_total_bdt: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    table: Mapped[RestaurantTable] = relationship(back_populates="reservations")
    items: Mapped[list[ReservationItem]] = relationship(
        back_populates="reservation",
        cascade="all, delete-orphan",
    )


class ReservationItem(Base):
    __tablename__ = "reservation_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    selected_modifiers: Mapped[dict[str, Any]] = mapped_column(
        JSONVariant, nullable=False, default=dict
    )
    unit_price_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    reservation: Mapped[Reservation] = relationship(back_populates="items")
    menu_item: Mapped[MenuItem] = relationship()


class CulinaryKnowledgeChunk(Base):
    __tablename__ = "culinary_knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_tsv", "content_tsv", postgresql_using="gin"),
        Index(
            "ix_knowledge_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    source_filename: Mapped[str] = mapped_column(String(150), nullable=False)
    section_ref: Mapped[str] = mapped_column(String(64), nullable=False, default="§1.0")
    dish_slug: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    content_tsv: Mapped[Any] = mapped_column(TSVectorVariant, nullable=True)
    embedding: Mapped[Any] = mapped_column(VectorVariant, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONVariant, nullable=False, default=dict
    )
