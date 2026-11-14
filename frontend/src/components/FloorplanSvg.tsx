"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, Minus, Plus, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { RestaurantTable } from "@/types/nocturne";

export type VibeOverlayMode = "none" | "quiet" | "window";

interface FloorplanSvgProps {
  tables: RestaurantTable[];
  activeZoneSlug: string;
  selectedTableCode: string | null;
  heldTableCode: string | null;
  vibeOverlay: VibeOverlayMode;
  onSelectTable: (table: RestaurantTable) => void;
}

function getStatusColors(
  table: RestaurantTable,
  isSelected: boolean,
  isHeldByYou: boolean
) {
  if (table.status === "BOOKED") {
    return {
      fill: "#262320",
      stroke: "#48423B",
      text: "#8C8273",
      dot: "#6B6359",
      cursor: "not-allowed",
    };
  }
  if (table.status === "HELD_BY_OTHERS") {
    return {
      fill: "rgba(224, 90, 55, 0.20)",
      stroke: "#E05A37",
      text: "#FAF7F2",
      dot: "#E05A37",
      cursor: "not-allowed",
    };
  }
  if (isHeldByYou || table.status === "HELD_BY_YOU") {
    return {
      fill: "rgba(212, 175, 55, 0.28)",
      stroke: "#E6C768",
      text: "#FAF7F2",
      dot: "#2E8B57",
      cursor: "pointer",
    };
  }
  if (isSelected) {
    return {
      fill: "rgba(212, 175, 55, 0.16)",
      stroke: "#D4AF37",
      text: "#FAF7F2",
      dot: "#D4AF37",
      cursor: "pointer",
    };
  }
  return {
    fill: "#171513",
    stroke: "rgba(212, 175, 55, 0.45)",
    text: "#FAF7F2",
    dot: "#2E8B57",
    cursor: "pointer",
  };
}

function RoundTable2({
  table,
  colors,
  dimmed,
  highlighted,
  onClick,
}: {
  table: RestaurantTable;
  colors: ReturnType<typeof getStatusColors>;
  dimmed: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  return (
    <g
      transform={`translate(${table.svg_x}, ${table.svg_y})`}
      onClick={onClick}
      style={{ cursor: colors.cursor, opacity: dimmed ? 0.28 : 1 }}
      className="transition-opacity duration-300"
      role="button"
      aria-label={`Table ${table.table_code}, ${table.noise_db} dB, ${table.status}`}
    >
      {highlighted && (
        <circle
          r={42}
          fill="none"
          stroke="#D4AF37"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.75}
        />
      )}
      {/* Top & Bottom Architectural Chairs */}
      <path d="M-12,-33 Q0,-39 12,-33" fill="none" stroke={colors.stroke} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M-12,33 Q0,39 12,33" fill="none" stroke={colors.stroke} strokeWidth={2.2} strokeLinecap="round" />
      {/* Marble Circular Top */}
      <circle
        r={26}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2}
      />
      <circle r={4} cx={-15} cy={-15} fill={colors.dot} />
      <text
        y={-2}
        textAnchor="middle"
        fill={colors.text}
        fontSize="12"
        fontFamily="var(--font-jetbrains), monospace"
        fontWeight="600"
      >
        {table.table_code}
      </text>
      <text
        y={12}
        textAnchor="middle"
        fill="#A39B8F"
        fontSize="9"
        fontFamily="var(--font-jetbrains), monospace"
      >
        {table.noise_db} dB
      </text>
    </g>
  );
}

function RectTable4({
  table,
  colors,
  dimmed,
  highlighted,
  onClick,
}: {
  table: RestaurantTable;
  colors: ReturnType<typeof getStatusColors>;
  dimmed: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  return (
    <g
      transform={`translate(${table.svg_x}, ${table.svg_y})`}
      onClick={onClick}
      style={{ cursor: colors.cursor, opacity: dimmed ? 0.28 : 1 }}
      className="transition-opacity duration-300"
      role="button"
      aria-label={`Table ${table.table_code}, ${table.noise_db} dB, ${table.status}`}
    >
      {highlighted && (
        <rect
          x={-44}
          y={-34}
          width={88}
          height={68}
          rx={14}
          fill="none"
          stroke="#D4AF37"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.75}
        />
      )}
      {/* 4 Chairs */}
      <rect x={-22} y={-28} width={16} height={4} rx={2} fill={colors.stroke} />
      <rect x={6} y={-28} width={16} height={4} rx={2} fill={colors.stroke} />
      <rect x={-22} y={24} width={16} height={4} rx={2} fill={colors.stroke} />
      <rect x={6} y={24} width={16} height={4} rx={2} fill={colors.stroke} />
      {/* Oak Rectangular Tabletop */}
      <rect
        x={-34}
        y={-21}
        width={68}
        height={42}
        rx={8}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2}
      />
      <circle r={4} cx={-24} cy={-12} fill={colors.dot} />
      <text
        y={-1}
        textAnchor="middle"
        fill={colors.text}
        fontSize="12"
        fontFamily="var(--font-jetbrains), monospace"
        fontWeight="600"
      >
        {table.table_code}
      </text>
      <text
        y={13}
        textAnchor="middle"
        fill="#A39B8F"
        fontSize="9"
        fontFamily="var(--font-jetbrains), monospace"
      >
        4P • {table.noise_db}dB
      </text>
    </g>
  );
}

function CurvedBooth6({
  table,
  colors,
  dimmed,
  highlighted,
  onClick,
}: {
  table: RestaurantTable;
  colors: ReturnType<typeof getStatusColors>;
  dimmed: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  return (
    <g
      transform={`translate(${table.svg_x}, ${table.svg_y})`}
      onClick={onClick}
      style={{ cursor: colors.cursor, opacity: dimmed ? 0.28 : 1 }}
      className="transition-opacity duration-300"
      role="button"
      aria-label={`Booth ${table.table_code}, ${table.noise_db} dB, ${table.status}`}
    >
      {highlighted && (
        <rect
          x={-64}
          y={-34}
          width={128}
          height={68}
          rx={24}
          fill="none"
          stroke="#D4AF37"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.75}
        />
      )}
      {/* Curved Velvet Banquette Backing */}
      <path
        d="M-54,-18 C-54,-31 54,-31 54,-18 L54,18 C54,31 -54,31 -54,18"
        fill="none"
        stroke={colors.stroke}
        strokeWidth={3}
        strokeOpacity={0.75}
      />
      {/* Walnut Booth Table */}
      <rect
        x={-44}
        y={-18}
        width={88}
        height={36}
        rx={12}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2}
      />
      <circle r={4} cx={-33} cy={-9} fill={colors.dot} />
      <text
        y={-1}
        textAnchor="middle"
        fill={colors.text}
        fontSize="12"
        fontFamily="var(--font-jetbrains), monospace"
        fontWeight="600"
      >
        {table.table_code}
      </text>
      <text
        y={12}
        textAnchor="middle"
        fill="#A39B8F"
        fontSize="9"
        fontFamily="var(--font-jetbrains), monospace"
      >
        VIP {table.capacity_max}P • {table.noise_db}dB
      </text>
    </g>
  );
}

export function FloorplanSvg({
  tables,
  activeZoneSlug,
  selectedTableCode,
  heldTableCode,
  vibeOverlay,
  onSelectTable,
}: FloorplanSvgProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[role='button']")) return;
    setIsDragging(true);
    setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const nextX = Math.max(-220, Math.min(220, e.clientX - dragOrigin.x));
    const nextY = Math.max(-140, Math.min(140, e.clientY - dragOrigin.y));
    setPan({ x: nextX, y: nextY });
  };

  const handlePointerUp = () => setIsDragging(false);

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const isHighlightedByVibe = (t: RestaurantTable): boolean => {
    if (vibeOverlay === "quiet") return t.is_quiet_zone || t.noise_db <= 55;
    if (vibeOverlay === "window") return t.is_window_side;
    return false;
  };

  return (
    <div className="relative bg-charcoal border border-brass/30 overflow-hidden shadow-card">
      {/* Top Legend & Zoom Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-brass/20 bg-obsidian/80">
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1.5 text-sand">
            <span className="w-2.5 h-2.5 rounded-full bg-sage" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5 text-brass">
            <span className="w-2.5 h-2.5 rounded-full bg-brass" />
            Held By You
          </span>
          <span className="inline-flex items-center gap-1.5 text-ember">
            <span className="w-2.5 h-2.5 rounded-full bg-ember" />
            Held By Others
          </span>
          <span className="inline-flex items-center gap-1.5 text-sand/60">
            <span className="w-2.5 h-2.5 rounded-full bg-[#48423B]" />
            Booked
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.15).toFixed(2))))}
            aria-label="Zoom out floorplan"
            className="w-8 h-8 border border-brass/30 bg-charcoal text-sand hover:text-cream hover:border-brass flex items-center justify-center transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-cream tabular-nums w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.65, Number((z + 0.15).toFixed(2))))}
            aria-label="Zoom in floorplan"
            className="w-8 h-8 border border-brass/30 bg-charcoal text-sand hover:text-cream hover:border-brass flex items-center justify-center transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetViewport}
            aria-label="Reset floorplan view"
            className="ml-1 px-2.5 h-8 border border-brass/30 bg-charcoal text-sand hover:text-cream hover:border-brass text-[11px] font-mono inline-flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Interactive Zoomable / Pannable 2D Architectural SVG Canvas */}
      <div
        data-cursor="DRAG"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative w-full overflow-hidden bg-obsidian select-none cursor-grab active:cursor-grabbing"
      >
        <motion.div
          animate={{ scale: zoom, x: pan.x, y: pan.y }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="origin-center"
        >
          <svg
            viewBox="0 0 1000 650"
            className="w-full h-auto block"
            role="img"
            aria-label="Nocturne Banani 14th-Floor Architectural Floorplan"
          >
            <defs>
              <pattern
                id="archGrid"
                width="25"
                height="25"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 25 0 L 0 0 0 25"
                  fill="none"
                  stroke="rgba(212,175,55,0.06)"
                  strokeWidth="0.7"
                />
              </pattern>
              <radialGradient id="hearthGlow" cx="50%" cy="30%" r="60%">
                <stop offset="0%" stopColor="rgba(224,90,55,0.28)" />
                <stop offset="100%" stopColor="rgba(224,90,55,0)" />
              </radialGradient>
              <linearGradient id="skylineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(46,139,87,0.16)" />
                <stop offset="50%" stopColor="rgba(212,175,55,0.12)" />
                <stop offset="100%" stopColor="rgba(212,175,55,0)" />
              </linearGradient>
            </defs>

            {/* Architectural Grid Backdrop */}
            <rect width="1000" height="650" fill="#0E0D0C" />
            <rect width="1000" height="650" fill="url(#archGrid)" />

            {/* Banani Lake Horizon Strip (West Skyline Wall) */}
            <rect x="14" y="40" width="24" height="570" rx="12" fill="rgba(212,175,55,0.06)" stroke="rgba(212,175,55,0.22)" strokeWidth="1" />
            <text
              x="-325"
              y="30"
              transform="rotate(-90)"
              textAnchor="middle"
              fill="#D4AF37"
              fontSize="10"
              letterSpacing="4"
              fontFamily="var(--font-jetbrains), monospace"
            >
              BANANI LAKE &amp; GULSHAN SKYLINE BALUSTRADE
            </text>

            {/* Vibe Overlay Layer */}
            {vibeOverlay === "window" && (
              <>
                <rect x="44" y="55" width="130" height="550" rx="18" fill="url(#skylineGlow)" />
                <rect x="380" y="465" width="290" height="105" rx="18" fill="rgba(212,175,55,0.12)" />
              </>
            )}
            {vibeOverlay === "quiet" && (
              <>
                <rect x="44" y="55" width="275" height="550" rx="18" fill="rgba(46,139,87,0.09)" />
                <rect x="745" y="55" width="215" height="550" rx="18" fill="rgba(46,139,87,0.12)" />
                <rect x="380" y="465" width="290" height="105" rx="18" fill="rgba(46,139,87,0.09)" />
              </>
            )}

            {/* Wing 1: Skyline Rooftop Container */}
            <rect
              x="46"
              y="55"
              width="275"
              height="550"
              rx="18"
              fill="rgba(23,21,19,0.55)"
              stroke={activeZoneSlug === "rooftop" ? "#D4AF37" : "rgba(212,175,55,0.22)"}
              strokeWidth={activeZoneSlug === "rooftop" ? 1.8 : 1}
              strokeDasharray="6 4"
            />
            <text
              x="184"
              y="82"
              textAnchor="middle"
              fill="#FAF7F2"
              fontSize="12"
              letterSpacing="2"
              fontFamily="var(--font-cormorant), serif"
            >
              THE SKYLINE ROOFTOP (48–53 dB)
            </text>
            {/* Rooftop Planter Boxes */}
            <rect x="54" y="185" width="10" height="28" rx="4" fill="#2E8B57" fillOpacity="0.45" />
            <rect x="54" y="300" width="10" height="28" rx="4" fill="#2E8B57" fillOpacity="0.45" />
            <rect x="54" y="418" width="10" height="28" rx="4" fill="#2E8B57" fillOpacity="0.45" />

            {/* Wing 2: Chef's Glass Kitchen */}
            <rect
              x="355"
              y="55"
              width="340"
              height="550"
              rx="18"
              fill="rgba(23,21,19,0.55)"
              stroke={activeZoneSlug === "main-hall" ? "#D4AF37" : "rgba(212,175,55,0.22)"}
              strokeWidth={activeZoneSlug === "main-hall" ? 1.8 : 1}
            />
            {/* Open Oak Hearth & Glass Kitchen Counter */}
            <rect x="372" y="68" width="306" height="86" rx="12" fill="url(#hearthGlow)" stroke="#E05A37" strokeOpacity="0.55" strokeWidth="1.2" />
            <line x1="378" y1="154" x2="672" y2="154" stroke="#D4AF37" strokeOpacity="0.4" strokeDasharray="3 3" />
            <text
              x="525"
              y="103"
              textAnchor="middle"
              fill="#E05A37"
              fontSize="10"
              letterSpacing="2.5"
              fontFamily="var(--font-jetbrains), monospace"
            >
              WHITE-OAK EMBER HEARTH &amp; GLASS PASS
            </text>
            <text
              x="525"
              y="128"
              textAnchor="middle"
              fill="#FAF7F2"
              fontSize="12"
              letterSpacing="1.8"
              fontFamily="var(--font-cormorant), serif"
            >
              THE CHEF&apos;S GLASS KITCHEN (55–66 dB)
            </text>
            {/* South Colonnade Glass Line */}
            <line x1="370" y1="605" x2="680" y2="605" stroke="#D4AF37" strokeWidth="2.5" strokeOpacity="0.55" />
            <text
              x="525"
              y="594"
              textAnchor="middle"
              fill="#A39B8F"
              fontSize="9"
              letterSpacing="2"
              fontFamily="var(--font-jetbrains), monospace"
            >
              SOUTH BANANI WINDOW COLONNADE
            </text>

            {/* Wing 3: Velvet Booth Lounge */}
            <rect
              x="730"
              y="55"
              width="242"
              height="550"
              rx="18"
              fill="rgba(23,21,19,0.75)"
              stroke={activeZoneSlug === "private-lounge" ? "#D4AF37" : "rgba(212,175,55,0.22)"}
              strokeWidth={activeZoneSlug === "private-lounge" ? 1.8 : 1}
            />
            {/* Ribbed Smoked Glass Divider */}
            <line x1="730" y1="120" x2="730" y2="540" stroke="#D4AF37" strokeWidth="3" strokeOpacity="0.35" strokeDasharray="10 6" />
            <text
              x="851"
              y="80"
              textAnchor="middle"
              fill="#FAF7F2"
              fontSize="12"
              letterSpacing="1.8"
              fontFamily="var(--font-cormorant), serif"
            >
              THE VELVET LOUNGE (44–47 dB)
            </text>

            {/* Acoustic Threshold Callouts */}
            <text x="525" y="634" textAnchor="middle" fill="#A39B8F" fontSize="10" fontFamily="var(--font-jetbrains), monospace">
              CLICK ANY AVAILABLE SEAT TO TRIGGER ATOMIC 10-MIN REDIS HOLD • NOCTURNE ARCHITECTURAL PLAN (1000 × 650)
            </text>

            {/* 18 Clickable Database Tables */}
            {tables.map((table) => {
              const isSelected = selectedTableCode === table.table_code;
              const isHeldByYou =
                heldTableCode === table.table_code || table.status === "HELD_BY_YOU";
              const colors = getStatusColors(table, isSelected, isHeldByYou);
              const vibeMatch = isHighlightedByVibe(table);
              const zoneInactive =
                activeZoneSlug !== "all" && table.zone_slug !== activeZoneSlug;
              const dimmed =
                vibeOverlay !== "none"
                  ? !vibeMatch
                  : zoneInactive;

              const handleTableClick = () => {
                if (table.status === "BOOKED" || table.status === "HELD_BY_OTHERS") {
                  onSelectTable(table);
                  return;
                }
                onSelectTable(table);
              };

              if (table.shape === "ROUND_2") {
                return (
                  <RoundTable2
                    key={table.table_code}
                    table={table}
                    colors={colors}
                    dimmed={dimmed}
                    highlighted={vibeMatch || isSelected || isHeldByYou}
                    onClick={handleTableClick}
                  />
                );
              }
              if (table.shape === "RECT_4") {
                return (
                  <RectTable4
                    key={table.table_code}
                    table={table}
                    colors={colors}
                    dimmed={dimmed}
                    highlighted={vibeMatch || isSelected || isHeldByYou}
                    onClick={handleTableClick}
                  />
                );
              }
              return (
                <CurvedBooth6
                  key={table.table_code}
                  table={table}
                  colors={colors}
                  dimmed={dimmed}
                  highlighted={vibeMatch || isSelected || isHeldByYou}
                  onClick={handleTableClick}
                />
              );
            })}
          </svg>
        </motion.div>

        {/* Bottom Floating Vibe Hint */}
        {vibeOverlay !== "none" && (
          <div className="absolute bottom-3 left-4 inline-flex items-center gap-2 px-3 py-1.5 glass-obsidian font-mono text-[11px] text-brass">
            {vibeOverlay === "quiet" ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-sage" />
                <span>Quiet Conversation Overlay (≤ 55 dB highlighted)</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-brass" />
                <span>Skyline Window Views Overlay (Lake &amp; Horizon Sightlines)</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Subtle Bottom Strip */}
      <div className="px-5 py-3 bg-obsidian/70 border-t border-brass/10 flex items-center justify-between text-xs text-sand font-mono">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brass" />
          Tip: Press Ctrl+J anytime to ask our Maître d&apos; &amp; Sommelier for seating advice.
        </span>
        <span className="hidden sm:inline">Drag canvas to pan · Click table for perspective</span>
      </div>
    </div>
  );
}
