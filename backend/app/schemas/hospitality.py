from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TableShape = Literal["ROUND_2", "RECT_4", "BOOTH_6"]
TableStatus = Literal["AVAILABLE", "HELD_BY_YOU", "HELD_BY_OTHERS", "BOOKED"]
ReservationStatus = Literal["HELD", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED"]


class DiningZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    ambient_noise_db: int
    vibe_tagline: str
    description: str
    preview_image_url: str
    preview_video_url: str = ""
    table_count: int = 0
    available_count: int = 0


class TableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    table_code: str
    zone_id: int
    zone_slug: str
    zone_name: str
    capacity_min: int
    capacity_max: int
    shape: TableShape
    svg_x: float
    svg_y: float
    svg_rotation: float
    is_window_side: bool
    is_quiet_zone: bool
    noise_db: int
    perspective_photo_url: str
    vibe_notes: str
    status: TableStatus = "AVAILABLE"
    hold_ttl_seconds: int | None = None


class TableHoldRequest(BaseModel):
    reservation_date: date
    time_slot: str = Field(min_length=4, max_length=16, examples=["20:30"])
    session_id: str = Field(min_length=4, max_length=128)
    party_size: int | None = Field(default=None, ge=1, le=12)

    @field_validator("time_slot")
    @classmethod
    def validate_slot(cls, value: str) -> str:
        clean = value.strip()
        if ":" not in clean:
            raise ValueError("time_slot must be formatted as HH:MM")
        return clean


class TableHoldResponse(BaseModel):
    table_code: str
    reservation_date: date
    time_slot: str
    session_id: str
    status: Literal["HELD_BY_YOU"]
    ttl_seconds: int
    expires_at: datetime


class TableReleaseRequest(BaseModel):
    reservation_date: date
    time_slot: str = Field(min_length=4, max_length=16)
    session_id: str = Field(min_length=4, max_length=128)


class MenuItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    category: str
    description: str
    base_price_bdt: Decimal
    calories_kcal: int
    protein_grams: int
    prep_time_mins: int
    spice_level: int
    is_dairy_free: bool
    is_nut_free: bool
    is_gluten_free: bool
    is_signature: bool
    allergen_flags: list[str]
    customization_schema: dict[str, Any]
    image_url: str


class ReservationItemIn(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=20)
    selected_modifiers: dict[str, Any] = Field(default_factory=dict)


class ReservationConfirmRequest(BaseModel):
    table_code: str = Field(min_length=2, max_length=16)
    reservation_date: date
    time_slot: str = Field(min_length=4, max_length=16)
    session_id: str = Field(min_length=4, max_length=128)
    guest_name: str = Field(min_length=2, max_length=120)
    guest_phone: str = Field(min_length=6, max_length=32, examples=["+8801711000000"])
    party_size: int = Field(ge=1, le=12)
    special_occasion: str | None = Field(default=None, max_length=120)
    items: list[ReservationItemIn] = Field(default_factory=list)


class ReservationItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    menu_item_id: int
    dish_name: str
    dish_slug: str
    image_url: str
    quantity: int
    selected_modifiers: dict[str, Any]
    unit_price_bdt: Decimal


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference_code: str
    table_code: str
    zone_name: str
    zone_slug: str
    guest_name: str
    guest_phone: str
    party_size: int
    reservation_date: date
    time_slot: str
    status: ReservationStatus
    special_occasion: str | None
    pre_order_total_bdt: Decimal
    version: int
    created_at: datetime
    items: list[ReservationItemOut] = Field(default_factory=list)


class ConciergeChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ConciergeStreamRequest(BaseModel):
    message: str = Field(min_length=2, max_length=1500)
    reservation_date: date = Field(default_factory=date.today)
    time_slot: str = Field(default="20:30", min_length=4, max_length=16)
    party_size: int = Field(default=2, ge=1, le=12)
    session_id: str | None = Field(default=None, max_length=128)
    history: list[ConciergeChatMessage] = Field(default_factory=list)

    @field_validator("time_slot")
    @classmethod
    def validate_slot(cls, value: str) -> str:
        clean = value.strip()
        if ":" not in clean:
            raise ValueError("time_slot must be formatted as HH:MM")
        return clean
