from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import MenuItem
from app.schemas.hospitality import MenuItemOut

router = APIRouter(prefix="/menu", tags=["menu"])


@router.get("", response_model=list[MenuItemOut])
async def list_menu_items(
    category: str | None = Query(default=None),
    dairy_free: bool | None = Query(default=None),
    nut_free: bool | None = Query(default=None),
    gluten_free: bool | None = Query(default=None),
    signature: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[MenuItemOut]:
    """Return signature menu items with dietary, category, and keyword filtering."""
    stmt = select(MenuItem).order_by(MenuItem.id)
    if category and category.lower() != "all":
        stmt = stmt.where(MenuItem.category == category)
    if dairy_free is True:
        stmt = stmt.where(MenuItem.is_dairy_free.is_(True))
    if nut_free is True:
        stmt = stmt.where(MenuItem.is_nut_free.is_(True))
    if gluten_free is True:
        stmt = stmt.where(MenuItem.is_gluten_free.is_(True))
    if signature is True:
        stmt = stmt.where(MenuItem.is_signature.is_(True))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(MenuItem.name.ilike(term), MenuItem.description.ilike(term))
        )

    rows = (await db.execute(stmt)).scalars().all()
    return [MenuItemOut.model_validate(item) for item in rows]
