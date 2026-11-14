---
name: interactive-svg-floorplan
description: Builds the interactive 2D architectural SVG restaurant floorplan with zoom/pan controls, acoustic/sunlight overlays, and real-time Redis TTL seat-hold countdown badges.
---
# Interactive 2D SVG Floorplan & Seat-Picker Skill
1. **Pure Code Architectural SVG:**
   - Render the restaurant map as a responsive `<svg viewBox="0 0 1000 650">` with architectural walls, rooftop terrace planters, an open kitchen counter, and window glass lines.
   - Create reusable React SVG sub-components for `<RoundTable2 />`, `<RectTable4 />`, and `<CurvedBooth6 />` positioned via `svg_x` and `svg_y` from the database.
2. **Tactile Seat Selection & Optimistic Locking:**
   - Clicking an `AVAILABLE` table triggers `POST /api/v1/tables/{code}/hold`, immediately morphing the table to Champagne Brass (`#D4AF37`) and starting a live 10:00 countdown pill in the header (`JetBrains Mono`).
   - Include a toggleable "Vibe Overlay" switch above the map that highlights `Quiet Conversation Zones` vs. `Skyline Window Views` directly on the SVG canvas.