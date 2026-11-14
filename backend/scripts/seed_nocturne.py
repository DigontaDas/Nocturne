"""Idempotent seeding script for Nocturne Dhaka database & pgvector knowledge chunks."""
from __future__ import annotations

import asyncio
import re
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure /backend is importable when invoked as `python scripts/seed_nocturne.py`
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.seed_data import MENU_ITEMS_SEED, TABLES_SEED, ZONES_SEED
from app.db.session import AsyncSessionLocal, init_extensions
from app.models.entities import (
    Base,
    CulinaryKnowledgeChunk,
    DiningZone,
    MenuItem,
    Reservation,
    ReservationItem,
    RestaurantTable,
)
from app.services.embeddings import embed_texts

KNOWLEDGE_DIR = BACKEND_DIR / "knowledge_docs"
DOC_TITLES = {
    "01_chef_allergen_and_ingredient_matrix.md": "Chef Allergen Matrix 2026",
    "02_rooftop_seating_and_policy_sop.md": "Rooftop Seating & Policy SOP",
    "03_sommelier_mocktail_pairings.md": "Sommelier Zero-Proof Pairings",
    "04_verified_guest_reviews.md": "Verified Diner Reviews 2026",
}
SECTION_RE = re.compile(r"^##\s+(§\d+\.\d+)\s+(.*)$", re.MULTILINE)


def parse_markdown_chunks(file_path: Path) -> list[dict[str, str | None]]:
    """Split a Markdown knowledge document by § sections into structured chunks."""
    raw = file_path.read_text(encoding="utf-8")
    matches = list(SECTION_RE.finditer(raw))
    doc_title = DOC_TITLES.get(file_path.name, file_path.stem.replace("_", " ").title())
    chunks: list[dict[str, str | None]] = []

    if not matches:
        return [
            {
                "doc_title": doc_title,
                "source_filename": file_path.name,
                "section_ref": "§1.0",
                "heading": doc_title,
                "content_text": raw.strip(),
                "dish_slug": None,
            }
        ]

    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw)
        section_ref = match.group(1).strip()
        heading = match.group(2).strip()
        body = raw[start:end].strip()

        matched_slug = None
        for dish in MENU_ITEMS_SEED:
            if dish["slug"] in body:
                matched_slug = dish["slug"]
                break

        chunks.append(
            {
                "doc_title": doc_title,
                "source_filename": file_path.name,
                "section_ref": section_ref,
                "heading": heading,
                "content_text": body,
                "dish_slug": matched_slug,
            }
        )
    return chunks


async def seed_database(db: AsyncSession) -> dict[str, int]:
    """Upsert zones, 18 tables, 12 menu items, sample bookings, and pgvector chunks."""
    zone_map: dict[str, DiningZone] = {}
    for z_data in ZONES_SEED:
        zone = (
            await db.execute(select(DiningZone).where(DiningZone.slug == z_data["slug"]))
        ).scalar_one_or_none()
        if zone is None:
            zone = DiningZone(**z_data)
            db.add(zone)
        else:
            for k, v in z_data.items():
                setattr(zone, k, v)
        await db.flush()
        zone_map[z_data["slug"]] = zone

    table_map: dict[str, RestaurantTable] = {}
    for t_data in TABLES_SEED:
        payload = {k: v for k, v in t_data.items() if k != "zone_slug"}
        payload["zone_id"] = zone_map[t_data["zone_slug"]].id
        table = (
            await db.execute(
                select(RestaurantTable).where(
                    RestaurantTable.table_code == t_data["table_code"]
                )
            )
        ).scalar_one_or_none()
        if table is None:
            table = RestaurantTable(**payload)
            db.add(table)
        else:
            for k, v in payload.items():
                setattr(table, k, v)
        await db.flush()
        table_map[t_data["table_code"]] = table

    menu_map: dict[str, MenuItem] = {}
    for m_data in MENU_ITEMS_SEED:
        dish = (
            await db.execute(select(MenuItem).where(MenuItem.slug == m_data["slug"]))
        ).scalar_one_or_none()
        if dish is None:
            dish = MenuItem(**m_data)
            db.add(dish)
        else:
            for k, v in m_data.items():
                setattr(dish, k, v)
        await db.flush()
        menu_map[m_data["slug"]] = dish

    # Seed realistic initial bookings for today so /reserve shows live BOOKED vs AVAILABLE contrast
    today = date.today()
    sample_bookings = [
        {
            "reference_code": "NOC-2026-9941",
            "table_code": "T-02",
            "guest_name": "Nadia Rahman",
            "guest_phone": "+8801711884422",
            "party_size": 2,
            "reservation_date": today,
            "time_slot": "20:30",
            "special_occasion": "Anniversary Sunset",
            "items": [
                ("miso-norwegian-salmon", 1, {"portion": "220g Center Fillet"}),
                ("smoked-hibiscus-mocktail", 2, {"portion": "Single Crystal Coupe"}),
            ],
        },
        {
            "reference_code": "NOC-2026-9942",
            "table_code": "T-09",
            "guest_name": "Farhan Chowdhury",
            "guest_phone": "+8801819332211",
            "party_size": 4,
            "reservation_date": today,
            "time_slot": "20:30",
            "special_occasion": "Culinary Tasting",
            "items": [
                ("wagyu-ribeye-steak", 2, {"portion": "300g Center Cut"}),
                ("black-truffle-tagliatelle", 1, {"portion": "Primi Bowl (220g)"}),
            ],
        },
    ]

    for sb in sample_bookings:
        existing_res = (
            await db.execute(
                select(Reservation).where(Reservation.reference_code == sb["reference_code"])
            )
        ).scalar_one_or_none()
        target_table = table_map[sb["table_code"]]
        slot_conflict = (
            await db.execute(
                select(Reservation).where(
                    Reservation.table_id == target_table.id,
                    Reservation.reservation_date == sb["reservation_date"],
                    Reservation.time_slot == sb["time_slot"],
                    Reservation.status != "CANCELLED",
                )
            )
        ).scalar_one_or_none()
        if existing_res is None and slot_conflict is None:
            res_items: list[ReservationItem] = []
            total = Decimal("0.00")
            for slug, qty, mods in sb["items"]:
                dish = menu_map[slug]
                total += Decimal(dish.base_price_bdt) * qty
                res_items.append(
                    ReservationItem(
                        menu_item_id=dish.id,
                        quantity=qty,
                        selected_modifiers=mods,
                        unit_price_bdt=dish.base_price_bdt,
                    )
                )
            db.add(
                Reservation(
                    reference_code=sb["reference_code"],
                    table_id=target_table.id,
                    guest_name=sb["guest_name"],
                    guest_phone=sb["guest_phone"],
                    party_size=sb["party_size"],
                    reservation_date=sb["reservation_date"],
                    time_slot=sb["time_slot"],
                    status="CONFIRMED",
                    special_occasion=sb["special_occasion"],
                    pre_order_total_bdt=total,
                    version=1,
                    items=res_items,
                )
            )

    # Rebuild pgvector RAG chunks cleanly so re-seeding is deterministic
    await db.execute(delete(CulinaryKnowledgeChunk))
    raw_chunks: list[dict[str, str | None]] = []
    for doc_path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        raw_chunks.extend(parse_markdown_chunks(doc_path))

    vectors = embed_texts([c["content_text"] or "" for c in raw_chunks])
    is_postgres = db.bind is not None and db.bind.dialect.name == "postgresql"

    for chunk_meta, vector in zip(raw_chunks, vectors):
        content = chunk_meta["content_text"] or ""
        chunk = CulinaryKnowledgeChunk(
            doc_title=chunk_meta["doc_title"] or "Nocturne Guide",
            source_filename=chunk_meta["source_filename"] or "doc.md",
            section_ref=chunk_meta["section_ref"] or "§1.0",
            dish_slug=chunk_meta["dish_slug"],
            content_text=content,
            content_tsv=func.to_tsvector("english", content) if is_postgres else content,
            embedding=vector,
            metadata_json={
                "heading": chunk_meta["heading"],
                "section_ref": chunk_meta["section_ref"],
                "source_filename": chunk_meta["source_filename"],
            },
        )
        db.add(chunk)

    await db.commit()
    return {
        "zones": len(zone_map),
        "tables": len(table_map),
        "menu_items": len(menu_map),
        "knowledge_chunks": len(raw_chunks),
    }


async def main() -> None:
    await init_extensions()
    from app.db.session import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        counts = await seed_database(db)
        print(f"Seeded Nocturne flagship database successfully: {counts}")


if __name__ == "__main__":
    asyncio.run(main())
