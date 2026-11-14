from __future__ import annotations

import asyncio
import json
import math
import re
from dataclasses import dataclass
from datetime import date
from typing import Any, AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from redis.asyncio import Redis
from sqlalchemy import Float, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import CulinaryKnowledgeChunk, MenuItem
from app.schemas.hospitality import ConciergeStreamRequest, MenuItemOut, TableOut
from app.services.embeddings import embed_query
from app.services.table_availability import fetch_tables_with_status

_WORD_RE = re.compile(r"[a-z0-9_]+")
_BUDGET_RE = re.compile(
    r"(?:under|below|max(?:imum)?|within|less\s+than|<)\s*(?:৳|bdt|tk\.?)?\s*([\d,]+)",
    re.IGNORECASE,
)
_PARTY_RE = re.compile(r"(?:for|party\s+of|guests?\s*:?)\s*(\d{1,2})\b", re.IGNORECASE)

_DOC_BADGE_MAP: dict[str, str] = {
    "01_chef_allergen_and_ingredient_matrix.md": "Chef Allergen Guide",
    "02_rooftop_seating_and_policy_sop.md": "Rooftop Seating SOP",
    "03_sommelier_mocktail_pairings.md": "Sommelier Pairing Guide",
    "04_verified_guest_reviews.md": "Verified Guest Reviews",
}


@dataclass(slots=True)
class QueryIntents:
    party_size: int
    quiet_only: bool
    window_only: bool
    zone_slug: str | None
    dairy_free: bool
    nut_free: bool
    gluten_free: bool
    wants_pairing: bool
    max_budget_bdt: int | None


def _sse_event(event: str, payload: dict[str, Any]) -> str:
    """Format a Server-Sent Events frame."""
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


def _extract_query_intents(query: str, default_party_size: int) -> QueryIntents:
    """Extract acoustic, zone, dietary, pairing, and BDT budget intents."""
    low = query.lower()
    party_match = _PARTY_RE.search(query)
    party_size = default_party_size
    if party_match:
        parsed_party = int(party_match.group(1))
        if 1 <= parsed_party <= 12:
            party_size = parsed_party

    budget_match = _BUDGET_RE.search(query)
    max_budget_bdt = int(budget_match.group(1).replace(",", "")) if budget_match else None

    zone_slug: str | None = None
    if "velvet" in low or "booth" in low or "lounge" in low or "private" in low:
        zone_slug = "private-lounge"
    elif "glass kitchen" in low or "main hall" in low or "hearth" in low:
        zone_slug = "main-hall"
    elif "rooftop" in low or "skyline" in low or "terrace" in low:
        zone_slug = "rooftop"

    quiet_only = any(
        kw in low
        for kw in (
            "quiet",
            "away from kitchen",
            "away from the kitchen",
            "peaceful",
            "intimate",
            "anniversary",
            "conversation",
            "romantic",
        )
    )
    window_only = any(kw in low for kw in ("window", "skyline", "lake", "sunset", "view"))
    dairy_free = any(kw in low for kw in ("dairy-free", "dairy free", "no dairy", "lactose", "ghee-free", "ghee free"))
    nut_free = any(kw in low for kw in ("nut-free", "nut free", "no nuts", "peanut", "pistachio"))
    gluten_free = any(kw in low for kw in ("gluten-free", "gluten free", "celiac", "no gluten"))
    wants_pairing = any(kw in low for kw in ("pairing", "mocktail", "drink", "elixir", "beverage", "main"))

    return QueryIntents(
        party_size=party_size,
        quiet_only=quiet_only,
        window_only=window_only,
        zone_slug=zone_slug,
        dairy_free=dairy_free,
        nut_free=nut_free,
        gluten_free=gluten_free,
        wants_pairing=wants_pairing,
        max_budget_bdt=max_budget_bdt,
    )


async def find_available_tables_sql(
    db: AsyncSession,
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    party_size: int = 2,
    quiet_only: bool = False,
    window_only: bool = False,
    max_noise_db: int | None = None,
    zone_slug: str | None = None,
    session_id: str | None = None,
) -> list[dict[str, Any]]:
    """Tool: Query live PostgreSQL bookings & Redis locks for matching available tables."""
    all_tables = await fetch_tables_with_status(
        db=db,
        redis=redis,
        reservation_date=reservation_date,
        time_slot=time_slot,
        zone_slug=zone_slug,
        caller_session=session_id,
    )

    candidates: list[TableOut] = []
    for t in all_tables:
        if t.status not in ("AVAILABLE", "HELD_BY_YOU"):
            continue
        if party_size > t.capacity_max or party_size < t.capacity_min:
            continue
        if max_noise_db is not None and t.noise_db > max_noise_db:
            continue
        if quiet_only and not t.is_quiet_zone:
            continue
        candidates.append(t)

    # Relax minimum capacity / noise constraints gracefully if strict filter yielded zero rows
    if not candidates:
        candidates = [
            t
            for t in all_tables
            if t.status in ("AVAILABLE", "HELD_BY_YOU")
            and t.capacity_min <= party_size <= t.capacity_max
        ]
    if not candidates:
        candidates = [
            t
            for t in all_tables
            if t.status in ("AVAILABLE", "HELD_BY_YOU") and t.capacity_max >= party_size
        ]

    def rank_key(table: TableOut) -> tuple[int, int, int, int, str]:
        cap_fit = abs(table.capacity_max - party_size)
        window_rank = 0 if table.is_window_side else 1
        quiet_rank = 0 if table.is_quiet_zone else 1
        if quiet_only:
            return (quiet_rank, window_rank, table.noise_db, cap_fit, table.table_code)
        if window_only:
            return (window_rank, table.noise_db, cap_fit, quiet_rank, table.table_code)
        return (cap_fit, table.noise_db, quiet_rank, window_rank, table.table_code)

    candidates.sort(key=rank_key)
    return [c.model_dump(mode="json") for c in candidates[:6]]


def _token_overlap_score(query_tokens: list[str], text: str) -> float:
    if not query_tokens:
        return 0.0
    doc_tokens = set(_WORD_RE.findall(text.lower()))
    if not doc_tokens:
        return 0.0
    hits = sum(1 for tok in query_tokens if tok in doc_tokens)
    return min(1.0, hits / max(3, len(set(query_tokens))))


def _cosine_sim(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


async def search_chef_knowledge_rag(
    db: AsyncSession,
    query: str,
    top_k: int = 4,
) -> list[dict[str, Any]]:
    """Tool: Hybrid semantic pgvector + full-text BM25 search over curated chef markdown docs."""
    query_vec = embed_query(query)
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"

    scored_rows: list[tuple[float, CulinaryKnowledgeChunk]] = []
    if dialect == "postgresql":
        vec_sim = 1.0 - CulinaryKnowledgeChunk.embedding.cosine_distance(query_vec)
        ts_rank = func.coalesce(
            cast(
                func.ts_rank_cd(
                    CulinaryKnowledgeChunk.content_tsv,
                    func.plainto_tsquery("english", query),
                ),
                Float,
            ),
            literal(0.0),
        )
        hybrid_score = (0.65 * vec_sim) + (0.35 * func.least(literal(1.0), ts_rank))
        stmt = (
            select(CulinaryKnowledgeChunk, hybrid_score.label("hybrid_score"))
            .order_by(hybrid_score.desc())
            .limit(top_k)
        )
        rows = (await db.execute(stmt)).all()
        scored_rows = [(float(row.hybrid_score or 0.0), row[0]) for row in rows]
    else:
        chunks = (await db.execute(select(CulinaryKnowledgeChunk))).scalars().all()
        q_tokens = _WORD_RE.findall(query.lower())
        for chunk in chunks:
            emb = [float(v) for v in chunk.embedding] if chunk.embedding is not None else []
            cos = _cosine_sim(query_vec, emb) if emb else 0.0
            lex = _token_overlap_score(q_tokens, f"{chunk.doc_title} {chunk.content_text}")
            scored_rows.append((0.65 * cos + 0.35 * lex, chunk))
        scored_rows.sort(key=lambda item: item[0], reverse=True)
        scored_rows = scored_rows[:top_k]

    results: list[dict[str, Any]] = []
    seen_badges: set[str] = set()
    for score, chunk in scored_rows:
        doc_label = _DOC_BADGE_MAP.get(chunk.source_filename, "Nocturne Chef Guide")
        section = chunk.section_ref or "§1.0"
        badge = f"[{doc_label} {section}]"
        if badge in seen_badges and len(results) >= 2:
            continue
        seen_badges.add(badge)
        snippet = chunk.content_text.strip().replace("\n", " ")
        results.append(
            {
                "badge": badge,
                "title": chunk.doc_title,
                "source_filename": chunk.source_filename,
                "section_ref": section,
                "dish_slug": chunk.dish_slug,
                "snippet": snippet[:280] + ("..." if len(snippet) > 280 else ""),
                "score": round(score, 4),
            }
        )
    return results


async def search_menu_pairings_sql(
    db: AsyncSession,
    query: str,
    intents: QueryIntents,
) -> tuple[list[dict[str, Any]], int]:
    """Tool: Select diet-safe dishes & zero-proof mocktail pairing within budget from SQL."""
    stmt = select(MenuItem).order_by(MenuItem.base_price_bdt.asc(), MenuItem.id.asc())
    if intents.dairy_free:
        stmt = stmt.where(MenuItem.is_dairy_free.is_(True))
    if intents.nut_free:
        stmt = stmt.where(MenuItem.is_nut_free.is_(True))
    if intents.gluten_free:
        stmt = stmt.where(MenuItem.is_gluten_free.is_(True))

    items = (await db.execute(stmt)).scalars().all()
    if not items:
        return [], 0

    low = query.lower()
    mains = [m for m in items if m.category in ("Wood-Fired Steaks", "Artisanal Pasta")]
    if not mains:
        mains = [m for m in items if m.category == "Small Plates"] or list(items)
    mocktails = [m for m in items if m.category == "Botanical Mocktails"]

    def dish_text_bonus(dish: MenuItem) -> int:
        tokens = _WORD_RE.findall(low)
        hay = f"{dish.slug} {dish.name} {dish.description}".lower()
        return sum(1 for tok in tokens if len(tok) > 3 and tok in hay)

    mains_sorted = sorted(
        mains,
        key=lambda m: (-dish_text_bonus(m), -int(m.is_signature), float(m.base_price_bdt)),
    )
    mocktails_sorted = sorted(
        mocktails,
        key=lambda m: (-dish_text_bonus(m), -int(m.is_signature), float(m.base_price_bdt)),
    )

    chosen: list[MenuItem] = []
    budget = intents.max_budget_bdt

    if mains_sorted and mocktails_sorted and (intents.wants_pairing or budget is not None):
        best_pair: tuple[MenuItem, MenuItem] | None = None
        if budget is not None:
            for main in mains_sorted:
                for drink in mocktails_sorted:
                    if float(main.base_price_bdt + drink.base_price_bdt) <= budget:
                        best_pair = (main, drink)
                        break
                if best_pair is not None:
                    break
        if best_pair is None:
            best_pair = (mains_sorted[0], mocktails_sorted[0])
        chosen = [best_pair[0], best_pair[1]]
    elif mains_sorted:
        selected = mains_sorted[0]
        if budget is not None:
            under = [m for m in mains_sorted if float(m.base_price_bdt) <= budget]
            if under:
                selected = under[0]
        chosen = [selected]
    elif mocktails_sorted:
        chosen = [mocktails_sorted[0]]

    serialized = [MenuItemOut.model_validate(m).model_dump(mode="json") for m in chosen]
    total_bdt = int(round(sum(float(m.base_price_bdt) for m in chosen)))
    return serialized, total_bdt


def _build_deterministic_reply(
    query: str,
    intents: QueryIntents,
    tables: list[dict[str, Any]],
    dishes: list[dict[str, Any]],
    pairing_total_bdt: int,
    citations: list[dict[str, Any]],
    reservation_date: date,
    time_slot: str,
) -> str:
    """Compose a concise, factual hospitality response grounded solely in SQL + RAG results."""
    lines: list[str] = []
    top_table = tables[0] if tables else None

    if top_table:
        badge_seat = next(
            (c["badge"] for c in citations if "Seating" in c["badge"] or "Reviews" in c["badge"]),
            "[Rooftop Seating SOP §1.2]",
        )
        lines.append(
            f"**Recommended Table — `{top_table['table_code']}` ({top_table['zone_name']})**"
        )
        lines.append(
            f"Available for **{intents.party_size} guests** on **{reservation_date.isoformat()}** at **{time_slot}** "
            f"measured at **{top_table['noise_db']} dB** "
            f"({'skyline window-side' if top_table['is_window_side'] else 'architectural gallery'}, "
            f"{'quiet conversation zone' if top_table['is_quiet_zone'] else 'lively hearth energy'}) "
            f"{badge_seat}. *{top_table['vibe_notes']}*"
        )
    else:
        lines.append(
            f"No tables currently match {intents.party_size} guests at {time_slot} on {reservation_date.isoformat()}."
        )

    if dishes:
        badge_allergen = next(
            (c["badge"] for c in citations if "Allergen" in c["badge"]),
            "[Chef Allergen Guide §1.2]",
        )
        badge_pair = next(
            (c["badge"] for c in citations if "Sommelier" in c["badge"]),
            "[Sommelier Pairing Guide §1.2]",
        )
        lines.append("")
        lines.append("**Curated Dish & Zero-Proof Pairing**")
        for item in dishes:
            diet_tags: list[str] = []
            if item["is_dairy_free"]:
                diet_tags.append("Dairy-Free")
            if item["is_nut_free"]:
                diet_tags.append("Nut-Free")
            if item["is_gluten_free"]:
                diet_tags.append("Gluten-Free")
            tag_str = ", ".join(diet_tags) if diet_tags else "Chef Signature"
            lines.append(
                f"- **{item['name']}** — **৳ {int(float(item['base_price_bdt'])):,}** "
                f"({item['calories_kcal']} kcal · {item['protein_grams']}g protein · {tag_str})"
            )

        budget_note = (
            f" (comfortably within your **৳ {intents.max_budget_bdt:,}** target)"
            if intents.max_budget_bdt and pairing_total_bdt <= intents.max_budget_bdt
            else ""
        )
        lines.append("")
        lines.append(
            f"**Pairing Total: ৳ {pairing_total_bdt:,}**{budget_note}. Prepared on isolated cast-iron & barware stations "
            f"with zero butter, cream, or hidden dairy {badge_allergen} {badge_pair}."
        )

    lines.append("")
    lines.append(
        "Use **Hold Table & Add Pairing** below to lock this seat for 10 minutes and add these plates directly to your tray."
    )
    return "\n".join(lines)


async def _try_langchain_narrative(
    payload: ConciergeStreamRequest,
    tables: list[dict[str, Any]],
    dishes: list[dict[str, Any]],
    pairing_total_bdt: int,
    citations: list[dict[str, Any]],
) -> tuple[str, str] | None:
    """Optionally polish narrative via LangChain Groq/OpenAI with bound tool schema."""
    llm = None
    provider = ""

    if settings.GROQ_API_KEY.strip():
        try:
            from langchain_groq import ChatGroq

            llm = ChatGroq(
                api_key=settings.GROQ_API_KEY.strip(),
                model="llama-3.3-70b-versatile",
                temperature=0.2,
                max_tokens=450,
            )
            provider = "langchain-groq"
        except Exception:
            llm = None

    if llm is None and settings.OPENAI_API_KEY.strip():
        try:
            from langchain_openai import ChatOpenAI

            llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY.strip(),
                model="gpt-4o-mini",
                temperature=0.2,
                max_tokens=450,
            )
            provider = "langchain-openai"
        except Exception:
            llm = None

    if llm is None:
        return None

    @tool("find_available_tables_sql")
    def _lc_tables_tool(party_size: int = 2) -> str:
        """Return verified live available tables from PostgreSQL + Redis."""
        return json.dumps(tables[:3], default=str)

    @tool("search_chef_knowledge_rag")
    def _lc_rag_tool(query: str) -> str:
        """Return retrieved chef allergen, SOP, and sommelier citations from pgvector."""
        return json.dumps(citations, default=str)

    llm_with_context = llm.bind_tools([_lc_tables_tool, _lc_rag_tool])
    context_blob = {
        "reservation_date": payload.reservation_date.isoformat(),
        "time_slot": payload.time_slot,
        "available_tables": tables[:3],
        "selected_dishes": [
            {
                "name": d["name"],
                "price_bdt": float(d["base_price_bdt"]),
                "is_dairy_free": d["is_dairy_free"],
                "is_gluten_free": d["is_gluten_free"],
                "is_nut_free": d["is_nut_free"],
                "calories_kcal": d["calories_kcal"],
                "protein_grams": d["protein_grams"],
            }
            for d in dishes
        ],
        "pairing_total_bdt": pairing_total_bdt,
        "citations": citations,
    }
    sys_msg = SystemMessage(
        content=(
            "You are the Nocturne Dhaka Flagship Culinary Concierge. "
            "Answer concisely in Markdown citing ONLY facts, prices in BDT (৳), table codes, dB noise ratings, "
            "and citation badges present in the JSON context below. Never invent dishes, prices, or policies.\n"
            f"VERIFIED CONTEXT:\n{json.dumps(context_blob)}"
        )
    )
    user_msg = HumanMessage(content=payload.message)
    try:
        response = await llm_with_context.ainvoke([sys_msg, user_msg])
        text = response.content if isinstance(response.content, str) else ""
        if text.strip():
            return text.strip(), provider
    except Exception:
        return None
    return None


async def stream_concierge_response(
    payload: ConciergeStreamRequest,
    db: AsyncSession,
    redis: Redis,
) -> AsyncIterator[str]:
    """Execute hybrid SQL + Redis + pgvector RAG pipeline and stream SSE events."""
    intents = _extract_query_intents(payload.message, payload.party_size)

    # 1. Live SQL + Redis Table Tool Execution
    yield _sse_event(
        "trace",
        {
            "id": "sql-tables",
            "tool": "find_available_tables_sql",
            "label": "SQL + Redis Live Table Lookup",
            "status": "running",
            "detail": f"Checking {payload.reservation_date.isoformat()} @ {payload.time_slot} for {intents.party_size} guests...",
        },
    )
    tables = await find_available_tables_sql(
        db=db,
        redis=redis,
        reservation_date=payload.reservation_date,
        time_slot=payload.time_slot,
        party_size=intents.party_size,
        quiet_only=intents.quiet_only,
        window_only=intents.window_only,
        zone_slug=intents.zone_slug,
        session_id=payload.session_id,
    )
    top_table = tables[0] if tables else None
    yield _sse_event(
        "trace",
        {
            "id": "sql-tables",
            "tool": "find_available_tables_sql",
            "label": "SQL + Redis Live Table Lookup",
            "status": "done",
            "detail": (
                f"Matched {len(tables)} live tables · Best fit: {top_table['table_code']} ({top_table['noise_db']} dB, {top_table['zone_name']})"
                if top_table
                else "Checked PostgreSQL & Redis; no open seats match strict criteria."
            ),
        },
    )

    # 2. pgvector + BM25 Hybrid Chef Knowledge Search
    yield _sse_event(
        "trace",
        {
            "id": "rag-knowledge",
            "tool": "search_chef_knowledge_rag",
            "label": "pgvector Hybrid Chef & Review Search",
            "status": "running",
            "detail": "Searching allergen matrix, seating SOPs, sommelier notes & diner reviews...",
        },
    )
    citations = await search_chef_knowledge_rag(db=db, query=payload.message, top_k=4)
    yield _sse_event(
        "trace",
        {
            "id": "rag-knowledge",
            "tool": "search_chef_knowledge_rag",
            "label": "pgvector Hybrid Chef & Review Search",
            "status": "done",
            "detail": f"Retrieved {len(citations)} verified knowledge sections.",
        },
    )
    for cite in citations:
        yield _sse_event("citation", cite)

    # 3. SQL Menu Pairing & BDT Budget Solver
    yield _sse_event(
        "trace",
        {
            "id": "sql-menu",
            "tool": "search_menu_pairings_sql",
            "label": "Menu Allergen & BDT Budget Matcher",
            "status": "running",
            "detail": "Filtering menu items against dietary flags & BDT cap...",
        },
    )
    dishes, pairing_total_bdt = await search_menu_pairings_sql(db=db, query=payload.message, intents=intents)
    yield _sse_event(
        "trace",
        {
            "id": "sql-menu",
            "tool": "search_menu_pairings_sql",
            "label": "Menu Allergen & BDT Budget Matcher",
            "status": "done",
            "detail": (
                f"Selected {', '.join(d['name'] for d in dishes)} (৳ {pairing_total_bdt:,})"
                if dishes
                else "No dishes matched dietary filters."
            ),
        },
    )

    # 4. Generate Narrative via LangChain (Groq/OpenAI if configured) or Grounded Synthesizer
    provider = "hybrid-sql-pgvector"
    lc_result = await _try_langchain_narrative(
        payload=payload,
        tables=tables,
        dishes=dishes,
        pairing_total_bdt=pairing_total_bdt,
        citations=citations,
    )
    if lc_result is not None:
        narrative, provider = lc_result
    else:
        narrative = _build_deterministic_reply(
            query=payload.message,
            intents=intents,
            tables=tables,
            dishes=dishes,
            pairing_total_bdt=pairing_total_bdt,
            citations=citations,
            reservation_date=payload.reservation_date,
            time_slot=payload.time_slot,
        )

    words = narrative.split(" ")
    chunk_size = 6
    for idx in range(0, len(words), chunk_size):
        piece = " ".join(words[idx : idx + chunk_size])
        if idx + chunk_size < len(words):
            piece += " "
        yield _sse_event("token", {"text": piece})
        await asyncio.sleep(0.005)

    # 5. Structured Generative UI Card Payload
    yield _sse_event(
        "cards",
        {
            "recommended_table": top_table,
            "alternative_tables": tables[1:3],
            "recommended_dishes": dishes,
            "pairing_total_bdt": pairing_total_bdt,
            "reservation_date": payload.reservation_date.isoformat(),
            "time_slot": payload.time_slot,
            "party_size": intents.party_size,
            "cta_label": "Hold Table & Add Pairing",
        },
    )

    yield _sse_event("done", {"ok": True, "provider": provider})
