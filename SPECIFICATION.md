# SYSTEM SPECIFICATION: NOCTURNE (Interactive 2D Seat-Picker, Pre-Order Studio & LangChain Culinary Concierge)

## 1. Product Vision & Aesthetic Direction
**Name:** Nocturne, Fine Dining Reserve & Culinary Concierge (Dhaka Flagship)
**Visual Theme:** "Midnight Rooftop & Brass" (Awwwards-grade consumer hospitality experience—NO boring admin table dashboards).
- **Canvas Background:** Deep Obsidian Espresso (`#0E0D0C`)
- **Elevated Surface / Cards:** Warm Charcoal (`#171513`) with `1px solid rgba(212, 175, 55, 0.14)` hairline borders.
- **Primary Accent:** Champagne Brass (`#D4AF37`) for active selections, glowing available tables, and primary CTAs.
- **Secondary Accent:** Terracotta Ember (`#E05A37`) for spice indicators, temporary 10-minute seat holds, and alerts; Sage Emerald (`#2E8B57`) for confirmed states.
- **Typography:**
  - Headings & Editorial Titles: `Cormorant Garamond` or `Instrument Serif` (italicized accents, large fluid sizing).
  - UI & Body: `Plus Jakarta Sans`.
  - Table Codes (`T-08`), Time Slots (`20:00`), Macros & BDT Prices (`৳ 2,450`): `JetBrains Mono` (`tabular-nums`).

---

## 2. Tech Stack & Free Code-Based Animation Libraries (Zero External Paid Tools)
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, `framer-motion` (interactive SVG floorplan physics, shared-layout dish modals, rotating plate cards), `gsap` + `@gsap/react` (scroll-triggered text & hero reveals), `lenis` (smooth inertia scrolling), `lucide-react` (clean thin-stroke icons), TanStack Query v5.
- **Backend:** FastAPI (Python 3.11+), SQLAlchemy 2.0 (Async), Pydantic v2, Alembic.
- **Database & Concurrency:** PostgreSQL 16 + `pgvector` extension, plus **Redis** for 10-minute TTL distributed seat-reservation holds (preventing double-booking race conditions).
- **AI / RAG Engine:** LangChain + LangGraph, Groq API (`llama-3.3-70b-versatile`) or OpenAI with local Ollama fallback, Hybrid Search (`pgvector` cosine similarity + Postgres Full-Text Search) over Chef Recipe/Allergen PDFs and Verified Diner Reviews.

---

## 3. Complete Page & Component Architecture (5 High-Impact Views)

### View 1: Scrollytelling Editorial Landing Page (`/`)
- **Smooth Scroll (Lenis + GSAP):** Full-viewport hero with muted background video loop (`/media/hero-ambiance.mp4` with dark radial vignette fallback), oversized serif headline *"Reserve Your Exact Perspective"*, and a floating glassmorphic **Quick Booking Bar** (`Date` | `Time Slot: 19:00, 20:30, 22:00` | `Party Size: 2–8` | `Explore Floorplan ->`).
- **Interactive Signature Dishes Showcase:** Horizontal scroll or 3-column bento showcase where hovering a dish card smoothly rotates the top-down plate image (`rotate: 12deg`, `scale: 1.06` via Framer Motion) and reveals live macro/allergen badges.
- **Zone Ambiance Switcher:** Interactive preview toggling between `The Skyline Rooftop`, `The Chef's Glass Kitchen`, and `The Velvet Booth Lounge` with smooth cross-fading photography and acoustic/vibe meters.

### View 2: Interactive 2D SVG Seat-Picker & Concurrency Hold Studio (`/reserve`)
- **Split-Screen Interactive Layout (Zero Blender—100% Pure Interactive React SVG):**
  - **Left/Center (65% width):** Custom-coded, zoomable 2D Architectural SVG Floorplan featuring 3 switchable zones (`Rooftop Terrace`, `Main Dining Hall`, `Private Lounge`) and 18 distinct tables:
    - 2-Seater Intimate Round Tables (`T-01` to `T-06`, Window/Skyline edge)
    - 4-Seater Dining Tables (`T-07` to `T-12`, Center & Kitchen View)
    - 6-to-8 Seater Curved VIP Booths (`B-01` to `B-06`, Private Alcoves)
  - **Live SVG States & Physics:**
    - `AVAILABLE`: Warm Brass outline (`#D4AF37`) with subtle pulsing glow; scales `1.08x` on hover.
    - `HELD_BY_OTHERS`: Amber dashed border with live countdown (`Held • 07:42 left`) driven by Redis TTL.
    - `BOOKED`: Muted dark slate (`#262421`), non-clickable.
    - `SELECTED_BY_YOU`: Solid Champagne Brass fill with animated checkmark.
  - **Right Panel (35% width) — "Table Perspective & Live Hold Drawer":**
    - Clicking any SVG table slides open its real-world view photo, acoustic noise rating (`Quiet Conversation • 52 dB`), server notes (*"Best sunset angle over Banani Lake"*), and a **"Hold Table for 10 Minutes & Pre-Order Menu ->"** button.

### View 3: Interactive Dish Customizer & Pre-Order Tray (`/menu` or Step 2 of Booking)
- **Category Filter Pills:** `Small Plates`, `Wood-Fired Steaks`, `Artisanal Pasta`, `Botanical Mocktails`, `Desserts` + Dietary Toggles (`Zero Nut`, `Gluten-Free`, `Low Carb`, `Chef's Signature`).
- **Shared-Layout Dish Customizer Modal (`layoutId`):**
  - Clicking any dish morphs the card into an interactive studio where users toggle portion size, spice intensity (`Mild` -> `Fiery Naga`), and side pairings.
  - **Animated Macro & Price Bar:** Smoothly animates `Calories (kcal)`, `Protein (g)`, `Prep Time (mins)`, and `Total BDT (৳)` using spring physics as options are toggled.

### View 4: Slide-Over AI Culinary Concierge & Table Architect (Global Drawer `Ctrl+J`)
- **Not a Plain Text Chatbot—Generative UI Cards:**
  - Users can ask natural questions like: *"Find me a quiet table for 2 tonight at 8:30 PM away from the kitchen, and recommend a dairy-free main course and mocktail under ৳3,500 total."*
  - **LangChain Execution Trace Badges:** Displays collapsible monospace steps showing:
    1. `check_live_table_availability(date="2026-11-14", slot="20:30", party_size=2, max_noise_db=55)` -> Queries PostgreSQL + Redis locks.
    2. `search_culinary_knowledge_rag("dairy-free main course allergens chef notes")` -> Queries `pgvector` Hybrid Search.
  - **Interactive Action Cards in Chat:** The AI response renders an interactive **Mini Table Card (`Table T-04 • Rooftop Edge`)** and **Dish Pairing Cards** with a 1-click **"Lock This Table & Add Pairing to Tray"** button that directly mutates the frontend state.

### View 5: Digital Boarding-Pass Reservation Ticket (`/booking/[referenceCode]`)
- After confirming a booking, renders a tactile, perforated **Digital Dining Pass** (inspired by Apple Wallet / Airline Boarding Passes) with a dynamic QR code, table number (`T-04`), time slot, pre-ordered menu breakdown in BDT, and a **"1-Click Host Check-In Simulator"** so recruiters can test the full lifecycle.

---

## 4. System Design & Database Schema (PostgreSQL + `pgvector` + Redis)

### 4.1 Core Relational Tables
1. **`dining_zones`**: `id`, `slug` (`rooftop`, `main-hall`, `private-lounge`), `name`, `ambient_noise_db` (INT), `description`, `preview_image_url`.
2. **`restaurant_tables`**: `id`, `table_code` (Unique, e.g., `T-04`), `zone_id` (FK), `capacity_min`, `capacity_max`, `shape` (`ROUND_2`, `RECT_4`, `BOOTH_6`), `svg_x` (FLOAT), `svg_y` (FLOAT), `svg_rotation` (FLOAT), `is_window_side` (BOOL), `is_quiet_zone` (BOOL), `perspective_photo_url`, `vibe_notes`.
3. **`menu_items`**: `id`, `slug`, `name`, `category`, `base_price_bdt` (NUMERIC), `calories_kcal` (INT), `protein_grams` (INT), `spice_level` (INT 0–3), `is_dairy_free` (BOOL), `is_nut_free` (BOOL), `is_gluten_free` (BOOL), `customization_schema` (JSONB), `image_url`.
4. **`reservations`**: `id`, `reference_code` (Unique, e.g., `NOC-2026-9941`), `table_id` (FK), `guest_name`, `guest_phone` (`+8801...`), `party_size`, `reservation_date` (DATE), `time_slot` (`18:30`, `20:00`, `21:30`), `status` (`HELD`, `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`), `special_occasion` (VARCHAR), `pre_order_total_bdt` (NUMERIC), `version` (INT for optimistic locking), `created_at`.
5. **`reservation_items`**: `id`, `reservation_id` (FK), `menu_item_id` (FK), `quantity`, `selected_modifiers` (JSONB), `unit_price_bdt` (NUMERIC).
6. **`culinary_knowledge_chunks` (`pgvector` RAG Table)**: `id`, `doc_title` (`Chef Allergen Matrix 2026`, `Sourcing & Halal Certification`, `Diner Review Highlights`), `dish_slug` (Nullable), `content_text`, `content_tsv` (TSVECTOR for BM25 keyword search), `embedding` (VECTOR), `metadata` (JSONB).

### 4.2 High-Concurrency Seat Locking Architecture (System Design Highlight)
- **Two-Phase Seat Reservation:**
  1. **Phase 1 (10-Minute Temporary Hold):** Calling `POST /api/v1/tables/{table_code}/hold` executes an atomic Redis `SET lock:table:{date}:{slot}:{table_code} {session_id} NX EX 600`. If the key already exists, return `HTTP 409 Conflict` immediately so two users can never select the same table simultaneously.
  2. **Phase 2 (ACID Confirmation):** Calling `POST /api/v1/reservations/confirm` verifies the caller owns the Redis lock, inserts the `reservations` and `reservation_items` inside a PostgreSQL `SELECT ... FOR UPDATE` transaction (with a unique database constraint on `(table_id, reservation_date, time_slot)` where `status != 'CANCELLED'`), and deletes the temporary Redis key.