"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  AdminTableLayoutItem,
  AdminTablePayload,
  adminCreateTable,
  adminDeleteTable,
  adminSaveTableLayout,
  adminUpdateTable,
} from "@/lib/api";
import { DiningZone, RestaurantTable, TableShape } from "@/types/nocturne";
import { AdminMediaField, MediaPreset } from "./AdminMediaField";

const TABLE_MEDIA_PRESETS: MediaPreset[] = [
  { label: "Rooftop Skyline", url: "/media/table-window-edge.png" },
  { label: "Glass Kitchen POV", url: "/media/table-kitchen-pov.jpg" },
  { label: "VIP Velvet Booth", url: "/media/table-vip-booth.png" },
  { label: "Lake Overlook", url: "/media/rooftop-view.png" },
  { label: "Kitchen Hearth", url: "/media/zone-glass-kitchen.png" },
  { label: "Lounge Sanctuary", url: "/media/zone-velvet-lounge.png" },
];

interface TableDraft {
  table_code: string;
  zone_slug: string;
  capacity_min: string;
  capacity_max: string;
  shape: TableShape;
  svg_x: number;
  svg_y: number;
  svg_rotation: number;
  is_window_side: boolean;
  is_quiet_zone: boolean;
  noise_db: string;
  perspective_photo_url: string;
  vibe_notes: string;
}

function inferZoneFromX(svgX: number, zones: DiningZone[]): string {
  const hasSlug = (slug: string) => zones.some((z) => z.slug === slug);
  if (svgX <= 338 && hasSlug("rooftop")) return "rooftop";
  if (svgX <= 712 && hasSlug("main-hall")) return "main-hall";
  if (svgX > 712 && hasSlug("private-lounge")) return "private-lounge";
  return zones[0]?.slug || "rooftop";
}

function suggestNextTableCode(tables: RestaurantTable[]): string {
  let maxNum = 18;
  for (const t of tables) {
    const match = /^T-(\d+)$/i.exec(t.table_code.trim());
    if (match) {
      maxNum = Math.max(maxNum, Number(match[1]));
    }
  }
  return `T-${String(maxNum + 1).padStart(2, "0")}`;
}

function draftFromTable(table: RestaurantTable): TableDraft {
  return {
    table_code: table.table_code,
    zone_slug: table.zone_slug,
    capacity_min: String(table.capacity_min),
    capacity_max: String(table.capacity_max),
    shape: table.shape,
    svg_x: Math.round(table.svg_x),
    svg_y: Math.round(table.svg_y),
    svg_rotation: Math.round(table.svg_rotation || 0),
    is_window_side: table.is_window_side,
    is_quiet_zone: table.is_quiet_zone,
    noise_db: String(table.noise_db),
    perspective_photo_url: table.perspective_photo_url,
    vibe_notes: table.vibe_notes,
  };
}

function newTableDraft(
  tables: RestaurantTable[],
  zones: DiningZone[],
  x = 185,
  y = 320
): TableDraft {
  const zoneSlug = inferZoneFromX(x, zones);
  return {
    table_code: suggestNextTableCode(tables),
    zone_slug: zoneSlug,
    capacity_min: "2",
    capacity_max: "4",
    shape: "RECT_4",
    svg_x: Math.round(x),
    svg_y: Math.round(y),
    svg_rotation: 0,
    is_window_side: zoneSlug === "rooftop",
    is_quiet_zone: zoneSlug !== "main-hall",
    noise_db: zoneSlug === "main-hall" ? "58" : "47",
    perspective_photo_url:
      zoneSlug === "main-hall"
        ? "/media/table-kitchen-pov.jpg"
        : zoneSlug === "private-lounge"
        ? "/media/table-vip-booth.png"
        : "/media/table-window-edge.png",
    vibe_notes: "Signature table position crafted by Boss layout console.",
  };
}

function clampCoord(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function clientPointToSvg(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) {
    const rect = svgEl.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 1000;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 650;
    return { x, y };
  }
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

interface AdminFloorplanEditorProps {
  token: string;
  tables: RestaurantTable[];
  zones: DiningZone[];
  onCatalogChanged: () => void;
}

export function AdminFloorplanEditor({
  token,
  tables,
  zones,
  onCatalogChanged,
}: AdminFloorplanEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedId, setSelectedId] = useState<number | "new">(
    tables[0]?.id ?? "new"
  );
  const [draft, setDraft] = useState<TableDraft>(() =>
    tables[0] ? draftFromTable(tables[0]) : newTableDraft(tables, zones)
  );
  const [layoutOverrides, setLayoutOverrides] = useState<
    Record<number, { svg_x: number; svg_y: number; svg_rotation: number; zone_slug: string }>
  >({});
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    setLayoutOverrides({});
  }, [tables]);

  const effectiveTables = useMemo(() => {
    return tables.map((t) => {
      const ov = layoutOverrides[t.id];
      return ov ? { ...t, ...ov } : t;
    });
  }, [tables, layoutOverrides]);

  const pendingLayoutCount = Object.keys(layoutOverrides).length;

  const snap = (v: number) => (snapToGrid ? Math.round(v / 5) * 5 : Math.round(v));

  const selectTable = (table: RestaurantTable) => {
    const ov = layoutOverrides[table.id];
    const merged = ov ? { ...table, ...ov } : table;
    setSelectedId(table.id);
    setDraft(draftFromTable(merged));
    setPlaceMode(false);
    setStatusMsg(null);
  };

  const startPlaceNewMode = () => {
    setPlaceMode((prev) => !prev);
    setStatusMsg(null);
  };

  const startNewAtCenter = () => {
    setSelectedId("new");
    setDraft(newTableDraft(tables, zones, 185, 325));
    setPlaceMode(false);
    setStatusMsg(null);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!placeMode || !svgRef.current) return;
    const target = e.target as Element;
    if (target.closest("[data-admin-table='true']")) return;

    const pt = clientPointToSvg(svgRef.current, e.clientX, e.clientY);
    const x = clampCoord(snap(pt.x), 30, 970);
    const y = clampCoord(snap(pt.y), 30, 620);
    setSelectedId("new");
    setDraft(newTableDraft(tables, zones, x, y));
    setPlaceMode(false);
    setStatusMsg({
      kind: "ok",
      text: `Placed draft table at (${x}, ${y}). Fill in details below and click Save Table.`,
    });
  };

  const handleTablePointerDown = (
    e: React.PointerEvent<SVGGElement>,
    table: RestaurantTable
  ) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    selectTable(table);
    setDraggingId(table.id);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingId === null || !svgRef.current) return;
    const pt = clientPointToSvg(svgRef.current, e.clientX, e.clientY);
    const x = clampCoord(snap(pt.x), 35, 965);
    const y = clampCoord(snap(pt.y), 40, 610);
    const currentTable = effectiveTables.find((t) => t.id === draggingId);
    const nextZone = inferZoneFromX(x, zones);
    const rotation = currentTable?.svg_rotation || 0;

    setLayoutOverrides((prev) => ({
      ...prev,
      [draggingId]: {
        svg_x: x,
        svg_y: y,
        svg_rotation: rotation,
        zone_slug: nextZone,
      },
    }));

    if (selectedId === draggingId) {
      setDraft((d) => ({
        ...d,
        svg_x: x,
        svg_y: y,
        zone_slug: nextZone,
      }));
    }
  };

  const handleSvgPointerUp = () => {
    if (draggingId !== null) {
      setDraggingId(null);
    }
  };

  const handleSaveBatchLayout = async () => {
    const entries: AdminTableLayoutItem[] = Object.entries(layoutOverrides).map(
      ([idStr, pos]) => ({
        id: Number(idStr),
        zone_slug: pos.zone_slug,
        svg_x: pos.svg_x,
        svg_y: pos.svg_y,
        svg_rotation: pos.svg_rotation,
      })
    );
    if (entries.length === 0) return;

    setBusy(true);
    setStatusMsg(null);
    try {
      await adminSaveTableLayout(token, entries);
      setLayoutOverrides({});
      setStatusMsg({
        kind: "ok",
        text: `Saved updated outline positions for ${entries.length} table(s).`,
      });
      onCatalogChanged();
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Unable to save table layout.",
      });
    } finally {
      setBusy(false);
    }
  };

  const updateSelectedAngle = (angle: number) => {
    const cleanAngle = Math.max(-180, Math.min(180, Math.round(angle)));
    setDraft((d) => ({ ...d, svg_rotation: cleanAngle }));
    if (selectedId !== "new") {
      const current = effectiveTables.find((t) => t.id === selectedId);
      if (current) {
        setLayoutOverrides((prev) => ({
          ...prev,
          [selectedId]: {
            svg_x: current.svg_x,
            svg_y: current.svg_y,
            svg_rotation: cleanAngle,
            zone_slug: draft.zone_slug,
          },
        }));
      }
    }
  };

  const handleSaveTableForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const payload: AdminTablePayload = {
      table_code: draft.table_code.trim().toUpperCase(),
      zone_slug: draft.zone_slug,
      capacity_min: Math.max(1, Number(draft.capacity_min) || 1),
      capacity_max: Math.max(1, Number(draft.capacity_max) || 2),
      shape: draft.shape,
      svg_x: clampCoord(Number(draft.svg_x) || 180, 20, 980),
      svg_y: clampCoord(Number(draft.svg_y) || 220, 20, 630),
      svg_rotation: clampCoord(Number(draft.svg_rotation) || 0, -360, 360),
      is_window_side: draft.is_window_side,
      is_quiet_zone: draft.is_quiet_zone,
      noise_db: Math.min(95, Math.max(20, Math.round(Number(draft.noise_db) || 48))),
      perspective_photo_url:
        draft.perspective_photo_url.trim() || "/media/table-window-edge.png",
      vibe_notes: draft.vibe_notes.trim() || "Architectural table seating.",
    };

    if (payload.capacity_min > payload.capacity_max) {
      setStatusMsg({
        kind: "err",
        text: "Minimum capacity cannot exceed maximum capacity.",
      });
      return;
    }

    setBusy(true);
    try {
      if (selectedId === "new") {
        const created = await adminCreateTable(token, payload);
        setSelectedId(created.id);
        setDraft(draftFromTable(created));
        setStatusMsg({
          kind: "ok",
          text: `Created table '${created.table_code}' on live floorplan.`,
        });
      } else {
        const updated = await adminUpdateTable(token, selectedId, payload);
        setLayoutOverrides((prev) => {
          const copy = { ...prev };
          delete copy[selectedId];
          return copy;
        });
        setDraft(draftFromTable(updated));
        setStatusMsg({
          kind: "ok",
          text: `Saved table '${updated.table_code}' outline & imagery.`,
        });
      }
      onCatalogChanged();
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not save table.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTable = async () => {
    if (selectedId === "new") return;
    setBusy(true);
    setStatusMsg(null);
    try {
      await adminDeleteTable(token, selectedId);
      const remaining = tables.filter((t) => t.id !== selectedId);
      if (remaining[0]) {
        setSelectedId(remaining[0].id);
        setDraft(draftFromTable(remaining[0]));
      } else {
        setSelectedId("new");
        setDraft(newTableDraft(tables, zones));
      }
      setStatusMsg({ kind: "ok", text: "Table removed from floorplan outline." });
      onCatalogChanged();
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Unable to delete table.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="border border-brass/25 bg-charcoal/85 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-sans text-[11px] uppercase tracking-[0.2em] text-brass">
            Architectural Outline &amp; Table Placement ({tables.length} Tables)
          </div>
          <p className="text-xs text-sand/85 mt-1">
            Drag any table directly on the canvas to rearrange the floorplan, rotate angles, or click &ldquo;Click-to-Place Table&rdquo; to add a new seat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 px-3 py-2 border border-brass/25 bg-obsidian text-xs font-sans text-sand cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              className="accent-[#D4AF37]"
            />
            <span>5px Grid Snap</span>
          </label>

          <button
            type="button"
            onClick={startPlaceNewMode}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 border text-xs font-sans uppercase tracking-[0.14em] transition-colors ${
              placeMode
                ? "border-brass bg-brass text-obsidian font-semibold"
                : "border-brass/35 bg-obsidian text-cream hover:border-brass"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{placeMode ? "Click Canvas to Place" : "Click-to-Place Table"}</span>
          </button>

          <button
            type="button"
            onClick={startNewAtCenter}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-brass/35 bg-obsidian hover:border-brass text-xs font-sans uppercase tracking-[0.14em] text-cream transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-brass" />
            <span>New Table Form</span>
          </button>

          {pendingLayoutCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setLayoutOverrides({})}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-sand/30 text-xs font-sans uppercase tracking-[0.14em] text-sand hover:text-cream transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert ({pendingLayoutCount})</span>
              </button>
              <button
                type="button"
                onClick={handleSaveBatchLayout}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sage hover:bg-sage/90 text-cream text-xs font-sans font-semibold uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {busy ? "Saving..." : `Save Moved Outline (${pendingLayoutCount})`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`px-4 py-3 border text-xs font-sans ${
            statusMsg.kind === "ok"
              ? "border-sage/50 bg-sage/10 text-cream"
              : "border-ember/50 bg-ember/10 text-cream"
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive 1000x650 Draggable SVG Outline */}
        <div className="xl:col-span-7 border border-brass/30 bg-obsidian p-3 select-none">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 650"
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerUp}
            className={`w-full h-auto touch-none ${
              placeMode ? "cursor-crosshair" : "cursor-default"
            }`}
          >
            <defs>
              <pattern id="adminArchGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                <path
                  d="M 25 0 L 0 0 0 25"
                  fill="none"
                  stroke="rgba(212, 175, 55, 0.09)"
                  strokeWidth="0.6"
                />
              </pattern>
            </defs>

            <rect width="1000" height="650" fill="#0E0D0C" />
            <rect width="1000" height="650" fill="url(#adminArchGrid)" />

            {/* Banani Lake Strip */}
            <rect
              x="14"
              y="40"
              width="24"
              height="570"
              rx="12"
              fill="rgba(212,175,55,0.06)"
              stroke="rgba(212,175,55,0.25)"
              strokeWidth="1"
            />
            <text
              x="-325"
              y="30"
              transform="rotate(-90)"
              textAnchor="middle"
              fill="#D4AF37"
              fontSize="10"
              letterSpacing="3.5"
              fontFamily="var(--font-sans), system-ui, sans-serif"
            >
              BANANI LAKE BALUSTRADE
            </text>

            {/* Wing 1: Rooftop */}
            <rect
              x="46"
              y="55"
              width="275"
              height="550"
              rx="18"
              fill="rgba(23,21,19,0.55)"
              stroke="rgba(212,175,55,0.3)"
              strokeDasharray="6 4"
            />
            <text
              x="184"
              y="80"
              textAnchor="middle"
              fill="#FAF7F2"
              fontSize="12"
              letterSpacing="2"
              fontFamily="var(--font-display), Georgia, serif"
            >
              SKYLINE ROOFTOP
            </text>

            {/* Wing 2: Main Hall + Open Kitchen */}
            <rect
              x="355"
              y="55"
              width="340"
              height="550"
              rx="18"
              fill="rgba(23,21,19,0.55)"
              stroke="rgba(212,175,55,0.3)"
            />
            <rect
              x="372"
              y="68"
              width="306"
              height="86"
              rx="12"
              fill="rgba(224,90,55,0.12)"
              stroke="#E05A37"
              strokeOpacity="0.55"
            />
            <text
              x="525"
              y="108"
              textAnchor="middle"
              fill="#E05A37"
              fontSize="10"
              letterSpacing="2.2"
              fontFamily="var(--font-sans), system-ui, sans-serif"
            >
              WHITE-OAK EMBER HEARTH
            </text>
            <text
              x="525"
              y="130"
              textAnchor="middle"
              fill="#FAF7F2"
              fontSize="11"
              letterSpacing="1.8"
              fontFamily="var(--font-display), Georgia, serif"
            >
              CHEF&apos;S GLASS KITCHEN
            </text>

            {/* Wing 3: Private Lounge */}
            <rect
              x="730"
              y="55"
              width="242"
              height="550"
              rx="18"
              fill="rgba(23,21,19,0.75)"
              stroke="rgba(212,175,55,0.3)"
            />
            <text
              x="851"
              y="80"
              textAnchor="middle"
              fill="#FAF7F2"
              fontSize="12"
              letterSpacing="1.8"
              fontFamily="var(--font-display), Georgia, serif"
            >
              THE VELVET LOUNGE
            </text>

            {/* Interactive Tables */}
            {effectiveTables.map((table) => {
              const isSelected = selectedId === table.id;
              const isModified = Boolean(layoutOverrides[table.id]);
              const rot = isSelected ? draft.svg_rotation : table.svg_rotation || 0;
              const stroke = isSelected
                ? "#E6C768"
                : isModified
                ? "#2E8B57"
                : "rgba(212,175,55,0.55)";
              const fill = isSelected ? "rgba(212,175,55,0.22)" : "#171513";

              return (
                <g
                  key={table.id}
                  data-admin-table="true"
                  transform={`translate(${table.svg_x}, ${table.svg_y})${rot ? ` rotate(${rot})` : ""}`}
                  onPointerDown={(e) => handleTablePointerDown(e, table)}
                  style={{ cursor: draggingId === table.id ? "grabbing" : "grab" }}
                >
                  {isSelected && (
                    <circle
                      r={table.shape === "BOOTH_6" ? 58 : 42}
                      fill="none"
                      stroke="#D4AF37"
                      strokeDasharray="4 4"
                      strokeWidth={1.6}
                    />
                  )}
                  {table.shape === "ROUND_2" && (
                    <circle r={26} fill={fill} stroke={stroke} strokeWidth={2} />
                  )}
                  {table.shape === "RECT_4" && (
                    <rect
                      x={-34}
                      y={-21}
                      width={68}
                      height={42}
                      rx={8}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                  )}
                  {table.shape === "BOOTH_6" && (
                    <rect
                      x={-44}
                      y={-18}
                      width={88}
                      height={36}
                      rx={12}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                  )}
                  <g transform={rot ? `rotate(${-rot})` : undefined}>
                    <text
                      y={-2}
                      textAnchor="middle"
                      fill="#FAF7F2"
                      fontSize="12"
                      fontWeight="600"
                      fontFamily="var(--font-sans), system-ui, sans-serif"
                    >
                      {table.table_code}
                    </text>
                    <text
                      y={12}
                      textAnchor="middle"
                      fill="#A39B8F"
                      fontSize="9"
                      fontFamily="var(--font-sans), system-ui, sans-serif"
                    >
                      {Math.round(table.svg_x)},{Math.round(table.svg_y)}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Ghost marker when creating a brand new table */}
            {selectedId === "new" && (
              <g
                transform={`translate(${draft.svg_x}, ${draft.svg_y})${draft.svg_rotation ? ` rotate(${draft.svg_rotation})` : ""}`}
              >
                <circle
                  r={40}
                  fill="rgba(46,139,87,0.16)"
                  stroke="#2E8B57"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                />
                <text
                  y={4}
                  textAnchor="middle"
                  fill="#FAF7F2"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="var(--font-sans), system-ui, sans-serif"
                >
                  + {draft.table_code}
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* Right: Table Inspector / Creator Panel */}
        <form
          onSubmit={handleSaveTableForm}
          className="xl:col-span-5 border border-brass/30 bg-charcoal/90 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3 border-b border-brass/20 pb-3">
            <div>
              <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-brass">
                {selectedId === "new" ? "New Table Entry" : `Editing Table #${selectedId}`}
              </div>
              <h3 className="font-display text-lg text-cream tracking-wide mt-0.5">
                {draft.table_code}
              </h3>
            </div>
            {selectedId !== "new" && (
              <button
                type="button"
                onClick={handleDeleteTable}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ember/45 hover:bg-ember/15 text-ember text-[11px] font-sans uppercase tracking-[0.14em] transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-sans text-[10px] uppercase tracking-[0.15em] text-sand/80 mb-1">
                Table Code
              </label>
              <input
                type="text"
                required
                value={draft.table_code}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, table_code: e.target.value.toUpperCase() }))
                }
                placeholder="T-19"
                className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-xs font-mono text-cream focus:outline-none focus:border-brass"
              />
            </div>

            <div>
              <label className="block font-sans text-[10px] uppercase tracking-[0.15em] text-sand/80 mb-1">
                Dining Zone Wing
              </label>
              <select
                value={draft.zone_slug}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, zone_slug: e.target.value }))
                }
                className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-xs text-cream focus:outline-none focus:border-brass"
              >
                {zones.map((z) => (
                  <option key={z.slug} value={z.slug}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                Shape
              </label>
              <select
                value={draft.shape}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, shape: e.target.value as TableShape }))
                }
                className="w-full px-2.5 py-2 bg-obsidian border border-brass/25 text-xs text-cream focus:outline-none focus:border-brass"
              >
                <option value="ROUND_2">Round (2P)</option>
                <option value="RECT_4">Rect (4P)</option>
                <option value="BOOTH_6">Booth (6P)</option>
              </select>
            </div>

            <div>
              <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                Min Seats
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.capacity_min}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, capacity_min: e.target.value }))
                }
                className="w-full px-2.5 py-2 bg-obsidian border border-brass/25 text-xs text-cream tabular-nums focus:outline-none focus:border-brass"
              />
            </div>

            <div>
              <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                Max Seats
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.capacity_max}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, capacity_max: e.target.value }))
                }
                className="w-full px-2.5 py-2 bg-obsidian border border-brass/25 text-xs text-cream tabular-nums focus:outline-none focus:border-brass"
              />
            </div>

            <div>
              <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                Noise (dB)
              </label>
              <input
                type="number"
                min={20}
                max={95}
                value={draft.noise_db}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, noise_db: e.target.value }))
                }
                className="w-full px-2.5 py-2 bg-obsidian border border-brass/25 text-xs text-cream tabular-nums focus:outline-none focus:border-brass"
              />
            </div>
          </div>

          {/* Coordinates + Rotation */}
          <div className="border border-brass/20 bg-obsidian/65 p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                  SVG X (20-980)
                </label>
                <input
                  type="number"
                  min={20}
                  max={980}
                  value={draft.svg_x}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      svg_x: clampCoord(Number(e.target.value) || 20, 20, 980),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-charcoal border border-brass/25 text-xs font-mono text-cream"
                />
              </div>
              <div>
                <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                  SVG Y (20-630)
                </label>
                <input
                  type="number"
                  min={20}
                  max={630}
                  value={draft.svg_y}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      svg_y: clampCoord(Number(e.target.value) || 20, 20, 630),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-charcoal border border-brass/25 text-xs font-mono text-cream"
                />
              </div>
              <div>
                <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
                  Rotation ({draft.svg_rotation}°)
                </label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  value={draft.svg_rotation}
                  onChange={(e) => updateSelectedAngle(Number(e.target.value))}
                  className="w-full accent-[#D4AF37] mt-2"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[-90, -45, 0, 45, 90].map((angle) => (
                <button
                  key={angle}
                  type="button"
                  onClick={() => updateSelectedAngle(angle)}
                  className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                    draft.svg_rotation === angle
                      ? "border-brass bg-brass/15 text-brass"
                      : "border-brass/20 text-sand/80 hover:border-brass/50"
                  }`}
                >
                  {angle}°
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-xs text-cream">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_window_side}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, is_window_side: e.target.checked }))
                }
                className="accent-[#D4AF37]"
              />
              <span>Window / Horizon Sightline</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_quiet_zone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, is_quiet_zone: e.target.checked }))
                }
                className="accent-[#D4AF37]"
              />
              <span>Quiet Acoustic Zone</span>
            </label>
          </div>

          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.15em] text-sand/80 mb-1">
              Architectural Vibe &amp; Sightline Notes
            </label>
            <textarea
              rows={2}
              required
              value={draft.vibe_notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, vibe_notes: e.target.value }))
              }
              className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-xs text-cream focus:outline-none focus:border-brass"
            />
          </div>

          <AdminMediaField
            label="Table Perspective Photo"
            value={draft.perspective_photo_url}
            onChange={(nextUrl) =>
              setDraft((d) => ({ ...d, perspective_photo_url: nextUrl }))
            }
            presets={TABLE_MEDIA_PRESETS}
            aspectClass="h-36"
          />

          <div className="flex justify-end pt-2 border-t border-brass/20">
            <button
              type="submit"
              disabled={busy}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-brass hover:bg-brass-light text-obsidian font-sans text-xs font-semibold uppercase tracking-[0.18em] transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {busy
                  ? "Saving..."
                  : selectedId === "new"
                  ? "Create Table on Plan"
                  : "Save Table Details & Image"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
