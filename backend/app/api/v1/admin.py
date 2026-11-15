"""Boss-only admin routes for menu curation, table inventory, layout outline, and photography."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.entities import (
    DiningZone,
    MenuItem,
    Reservation,
    ReservationItem,
    RestaurantTable,
)
from app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMenuCreate,
    AdminMenuUpdate,
    AdminSessionOut,
    AdminTableCreate,
    AdminTableLayoutBatchRequest,
    AdminTableUpdate,
)
from app.schemas.hospitality import MenuItemOut, TableOut
from app.services.admin_auth import (
    issue_admin_token,
    require_admin,
    verify_admin_credentials,
)

router = APIRouter(prefix="/admin", tags=["admin"])
_SLUG_CLEAN_RE = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    clean = _SLUG_CLEAN_RE.sub("-", value.strip().lower()).strip("-")
    return clean[:90] or "nocturne-dish"


def _serialize_table(table: RestaurantTable) -> TableOut:
    return TableOut(
        id=table.id,
        table_code=table.table_code,
        zone_id=table.zone_id,
        zone_slug=table.zone.slug,
        zone_name=table.zone.name,
        capacity_min=table.capacity_min,
        capacity_max=table.capacity_max,
        shape=table.shape,  # type: ignore[arg-type]
        svg_x=table.svg_x,
        svg_y=table.svg_y,
        svg_rotation=table.svg_rotation,
        is_window_side=table.is_window_side,
        is_quiet_zone=table.is_quiet_zone,
        noise_db=table.noise_db,
        perspective_photo_url=table.perspective_photo_url,
        vibe_notes=table.vibe_notes,
        status="AVAILABLE",
        hold_ttl_seconds=None,
    )


async def _get_zone_by_slug(db: AsyncSession, zone_slug: str) -> DiningZone:
    zone = (
        await db.execute(select(DiningZone).where(DiningZone.slug == zone_slug.strip()))
    ).scalar_one_or_none()
    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dining zone '{zone_slug}' not found.",
        )
    return zone


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest) -> AdminLoginResponse:
    """Authenticate Boss credentials and issue a signed admin bearer token."""
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Boss username or password.",
        )
    clean_user = payload.username.strip()
    token, expires_at = issue_admin_token(clean_user)
    return AdminLoginResponse(
        access_token=token,
        username=clean_user,
        expires_at=expires_at,
    )


@router.get("/me", response_model=AdminSessionOut)
async def admin_session(boss_user: str = Depends(require_admin)) -> AdminSessionOut:
    """Verify the active Boss session token."""
    return AdminSessionOut(username=boss_user, authenticated=True)


@router.post("/menu", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
async def admin_create_menu_item(
    payload: AdminMenuCreate,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MenuItemOut:
    """Create a new curated dish on the live menu."""
    base_slug = _slugify(payload.slug or payload.name)
    candidate_slug = base_slug
    suffix = 2
    while (
        await db.execute(select(MenuItem.id).where(MenuItem.slug == candidate_slug))
    ).scalar_one_or_none() is not None:
        candidate_slug = f"{base_slug}-{suffix}"
        suffix += 1

    dish = MenuItem(
        slug=candidate_slug,
        name=payload.name.strip(),
        category=payload.category.strip(),
        description=payload.description.strip(),
        base_price_bdt=payload.base_price_bdt,
        calories_kcal=payload.calories_kcal,
        protein_grams=payload.protein_grams,
        prep_time_mins=payload.prep_time_mins,
        spice_level=payload.spice_level,
        is_dairy_free=payload.is_dairy_free,
        is_nut_free=payload.is_nut_free,
        is_gluten_free=payload.is_gluten_free,
        is_signature=payload.is_signature,
        allergen_flags=payload.allergen_flags,
        customization_schema=payload.customization_schema,
        image_url=payload.image_url.strip(),
    )
    db.add(dish)
    await db.commit()
    await db.refresh(dish)
    return MenuItemOut.model_validate(dish)


@router.put("/menu/{item_id}", response_model=MenuItemOut)
async def admin_update_menu_item(
    item_id: int,
    payload: AdminMenuUpdate,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MenuItemOut:
    """Update an existing dish's details, price, dietary tags, or image."""
    dish = (
        await db.execute(select(MenuItem).where(MenuItem.id == item_id))
    ).scalar_one_or_none()
    if dish is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item #{item_id} not found.",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(dish, field, value)

    await db.commit()
    await db.refresh(dish)
    return MenuItemOut.model_validate(dish)


@router.delete("/menu/{item_id}")
async def admin_delete_menu_item(
    item_id: int,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int | bool]:
    """Delete a dish if no historical reservation pre-orders reference it."""
    dish = (
        await db.execute(select(MenuItem).where(MenuItem.id == item_id))
    ).scalar_one_or_none()
    if dish is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item #{item_id} not found.",
        )

    ref_count = int(
        (
            await db.scalar(
                select(func.count(ReservationItem.id)).where(
                    ReservationItem.menu_item_id == item_id
                )
            )
        )
        or 0
    )
    if ref_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot remove '{dish.name}' because {ref_count} guest reservation "
                "pre-order item(s) reference it."
            ),
        )

    await db.delete(dish)
    await db.commit()
    return {"deleted": True, "id": item_id}


@router.post("/tables", response_model=TableOut, status_code=status.HTTP_201_CREATED)
async def admin_create_table(
    payload: AdminTableCreate,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TableOut:
    """Add a new table onto the floorplan outline with seating specs and view photo."""
    zone = await _get_zone_by_slug(db, payload.zone_slug)
    existing = (
        await db.execute(
            select(RestaurantTable.id).where(
                RestaurantTable.table_code == payload.table_code
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Table code '{payload.table_code}' already exists.",
        )

    table = RestaurantTable(
        table_code=payload.table_code,
        zone_id=zone.id,
        capacity_min=payload.capacity_min,
        capacity_max=payload.capacity_max,
        shape=payload.shape,
        svg_x=payload.svg_x,
        svg_y=payload.svg_y,
        svg_rotation=payload.svg_rotation,
        is_window_side=payload.is_window_side,
        is_quiet_zone=payload.is_quiet_zone,
        noise_db=payload.noise_db,
        perspective_photo_url=payload.perspective_photo_url,
        vibe_notes=payload.vibe_notes.strip(),
    )
    db.add(table)
    await db.commit()

    loaded = (
        await db.execute(
            select(RestaurantTable)
            .options(selectinload(RestaurantTable.zone))
            .where(RestaurantTable.id == table.id)
        )
    ).scalar_one()
    return _serialize_table(loaded)


@router.put("/tables/{table_id}", response_model=TableOut)
async def admin_update_table(
    table_id: int,
    payload: AdminTableUpdate,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TableOut:
    """Update table metadata, SVG outline position/rotation, shape, or perspective image."""
    table = (
        await db.execute(
            select(RestaurantTable)
            .options(selectinload(RestaurantTable.zone))
            .where(RestaurantTable.id == table_id)
        )
    ).scalar_one_or_none()
    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table #{table_id} not found.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "zone_slug" in updates and updates["zone_slug"] is not None:
        zone = await _get_zone_by_slug(db, updates.pop("zone_slug"))
        table.zone_id = zone.id
        table.zone = zone

    next_min = updates.get("capacity_min", table.capacity_min)
    next_max = updates.get("capacity_max", table.capacity_max)
    if next_min > next_max:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="capacity_min cannot exceed capacity_max.",
        )

    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(table, field, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Table code '{table.table_code}' conflicts with another table.",
        ) from exc

    loaded = (
        await db.execute(
            select(RestaurantTable)
            .options(selectinload(RestaurantTable.zone))
            .where(RestaurantTable.id == table.id)
        )
    ).scalar_one()
    return _serialize_table(loaded)


@router.post("/tables/layout", response_model=list[TableOut])
async def admin_save_table_layout(
    payload: AdminTableLayoutBatchRequest,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TableOut]:
    """Batch-save table SVG positions, rotations, and optional zone assignments."""
    zones = (await db.execute(select(DiningZone))).scalars().all()
    zone_by_slug = {z.slug: z for z in zones}

    table_ids = [item.id for item in payload.tables]
    rows = (
        await db.execute(
            select(RestaurantTable)
            .options(selectinload(RestaurantTable.zone))
            .where(RestaurantTable.id.in_(table_ids))
        )
    ).scalars().all()
    by_id = {row.id: row for row in rows}

    missing = [tid for tid in table_ids if tid not in by_id]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table ID(s) not found: {missing}",
        )

    for item in payload.tables:
        table = by_id[item.id]
        table.svg_x = item.svg_x
        table.svg_y = item.svg_y
        table.svg_rotation = item.svg_rotation
        if item.zone_slug is not None:
            zone = zone_by_slug.get(item.zone_slug.strip())
            if zone is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dining zone '{item.zone_slug}' not found.",
                )
            table.zone_id = zone.id
            table.zone = zone

    await db.commit()

    refreshed = (
        await db.execute(
            select(RestaurantTable)
            .options(selectinload(RestaurantTable.zone))
            .order_by(RestaurantTable.table_code)
        )
    ).scalars().all()
    return [_serialize_table(t) for t in refreshed]


@router.delete("/tables/{table_id}")
async def admin_delete_table(
    table_id: int,
    _boss: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int | bool]:
    """Remove a floorplan table if no reservations reference it."""
    table = (
        await db.execute(select(RestaurantTable).where(RestaurantTable.id == table_id))
    ).scalar_one_or_none()
    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table #{table_id} not found.",
        )

    res_count = int(
        (
            await db.scalar(
                select(func.count(Reservation.id)).where(
                    Reservation.table_id == table_id
                )
            )
        )
        or 0
    )
    if res_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete table '{table.table_code}' because {res_count} "
                "reservation record(s) reference it."
            ),
        )

    await db.delete(table)
    await db.commit()
    return {"deleted": True, "id": table_id}
