"""Pydantic request and response contracts for Boss Admin menu & layout endpoints."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.hospitality import TableShape


def _validate_media_url(value: str) -> str:
    clean = value.strip()
    if not clean:
        raise ValueError("Media URL cannot be empty")
    if clean.startswith(("/media/", "https://", "http://", "data:image/")):
        return clean
    raise ValueError("Media URL must start with /media/, https://, http://, or data:image/")


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=256)


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    expires_at: datetime


class AdminSessionOut(BaseModel):
    username: str
    authenticated: bool = True


class AdminMenuCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    slug: str | None = Field(default=None, max_length=100)
    category: str = Field(min_length=2, max_length=64)
    description: str = Field(min_length=4, max_length=2000)
    base_price_bdt: Decimal = Field(ge=Decimal("0.00"), le=Decimal("250000.00"))
    calories_kcal: int = Field(default=420, ge=0, le=5000)
    protein_grams: int = Field(default=24, ge=0, le=500)
    prep_time_mins: int = Field(default=18, ge=1, le=240)
    spice_level: int = Field(default=1, ge=0, le=5)
    is_dairy_free: bool = False
    is_nut_free: bool = True
    is_gluten_free: bool = False
    is_signature: bool = True
    allergen_flags: list[str] = Field(default_factory=list)
    customization_schema: dict[str, Any] = Field(
        default_factory=lambda: {
            "portions": [{"label": "Signature Tasting Plate", "delta_bdt": 0}],
            "spice_levels": ["Gentle Warmth", "Medium Ember"],
            "addons": [],
        }
    )
    image_url: str = Field(default="/media/dish-lamb-rack.png", max_length=4_000_000)

    @field_validator("image_url")
    @classmethod
    def check_image_url(cls, value: str) -> str:
        return _validate_media_url(value)


class AdminMenuUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    category: str | None = Field(default=None, min_length=2, max_length=64)
    description: str | None = Field(default=None, min_length=4, max_length=2000)
    base_price_bdt: Decimal | None = Field(default=None, ge=Decimal("0.00"), le=Decimal("250000.00"))
    calories_kcal: int | None = Field(default=None, ge=0, le=5000)
    protein_grams: int | None = Field(default=None, ge=0, le=500)
    prep_time_mins: int | None = Field(default=None, ge=1, le=240)
    spice_level: int | None = Field(default=None, ge=0, le=5)
    is_dairy_free: bool | None = None
    is_nut_free: bool | None = None
    is_gluten_free: bool | None = None
    is_signature: bool | None = None
    allergen_flags: list[str] | None = None
    customization_schema: dict[str, Any] | None = None
    image_url: str | None = Field(default=None, max_length=4_000_000)

    @field_validator("image_url")
    @classmethod
    def check_image_url(cls, value: str | None) -> str | None:
        return _validate_media_url(value) if value is not None else None


class AdminTableCreate(BaseModel):
    table_code: str = Field(min_length=2, max_length=16)
    zone_slug: str = Field(min_length=2, max_length=64)
    capacity_min: int = Field(default=2, ge=1, le=20)
    capacity_max: int = Field(default=4, ge=1, le=20)
    shape: TableShape = "ROUND_2"
    svg_x: float = Field(ge=20.0, le=980.0)
    svg_y: float = Field(ge=20.0, le=630.0)
    svg_rotation: float = Field(default=0.0, ge=-360.0, le=360.0)
    is_window_side: bool = False
    is_quiet_zone: bool = False
    noise_db: int = Field(default=48, ge=20, le=95)
    perspective_photo_url: str = Field(
        default="/media/table-window-edge.png",
        max_length=4_000_000,
    )
    vibe_notes: str = Field(min_length=3, max_length=1000)

    @field_validator("table_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        clean = value.strip().upper()
        if not clean:
            raise ValueError("table_code is required")
        return clean

    @field_validator("perspective_photo_url")
    @classmethod
    def check_photo_url(cls, value: str) -> str:
        return _validate_media_url(value)

    @model_validator(mode="after")
    def validate_capacity_range(self) -> "AdminTableCreate":
        if self.capacity_min > self.capacity_max:
            raise ValueError("capacity_min cannot exceed capacity_max")
        return self


class AdminTableUpdate(BaseModel):
    table_code: str | None = Field(default=None, min_length=2, max_length=16)
    zone_slug: str | None = Field(default=None, min_length=2, max_length=64)
    capacity_min: int | None = Field(default=None, ge=1, le=20)
    capacity_max: int | None = Field(default=None, ge=1, le=20)
    shape: TableShape | None = None
    svg_x: float | None = Field(default=None, ge=20.0, le=980.0)
    svg_y: float | None = Field(default=None, ge=20.0, le=630.0)
    svg_rotation: float | None = Field(default=None, ge=-360.0, le=360.0)
    is_window_side: bool | None = None
    is_quiet_zone: bool | None = None
    noise_db: int | None = Field(default=None, ge=20, le=95)
    perspective_photo_url: str | None = Field(default=None, max_length=4_000_000)
    vibe_notes: str | None = Field(default=None, min_length=3, max_length=1000)

    @field_validator("table_code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else None

    @field_validator("perspective_photo_url")
    @classmethod
    def check_photo_url(cls, value: str | None) -> str | None:
        return _validate_media_url(value) if value is not None else None


class AdminTableLayoutItem(BaseModel):
    id: int
    zone_slug: str | None = None
    svg_x: float = Field(ge=20.0, le=980.0)
    svg_y: float = Field(ge=20.0, le=630.0)
    svg_rotation: float = Field(default=0.0, ge=-360.0, le=360.0)


class AdminTableLayoutBatchRequest(BaseModel):
    tables: list[AdminTableLayoutItem] = Field(min_length=1, max_length=200)
