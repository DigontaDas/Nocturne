"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Eye, Lock, Minus, Plus, Users, Volume2 } from "lucide-react";
import {
  fetchMenuItems,
  fetchTables,
  fetchZones,
  getOrCreateSessionId,
  holdTable,
  releaseTableHold,
} from "@/lib/api";
import { FALLBACK_MENU_ITEMS, FALLBACK_TABLES, FALLBACK_ZONES } from "@/lib/fallback-data";
import { useReservationContext } from "@/context/ReservationContext";
import { FloorplanSvg, VibeOverlayMode } from "@/components/FloorplanSvg";
import {
  formatCountdown,
  TablePerspectiveDrawer,
} from "@/components/TablePerspectiveDrawer";
import { MenuCustomizerSection } from "@/components/MenuCustomizerSection";
import { RestaurantTable } from "@/types/nocturne";

const TIME_SLOTS = ["19:00", "20:30", "22:00"] as const;

function ReserveStudioContent() {
  const searchParams = useSearchParams();
  const {
    selectedDate,
    setSelectedDate,
    selectedSlot,
    setSelectedSlot,
    partySize,
    setPartySize,
    heldTable,
    setHeldTable,
  } = useReservationContext();

  const [sessionId, setSessionId] = useState<string>("noc-guest");
  const [activeZoneSlug, setActiveZoneSlug] = useState<string>("all");
  const [vibeOverlay, setVibeOverlay] = useState<VibeOverlayMode>("none");
  const [selectedTableCode, setSelectedTableCode] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [headerCountdown, setHeaderCountdown] = useState<string>("10:00");

  // Hydrate URL query parameters once on mount
  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    const dateParam = searchParams.get("date");
    const slotParam = searchParams.get("slot");
    const guestsParam = searchParams.get("guests");
    const zoneParam = searchParams.get("zone");
    const tableParam = searchParams.get("table");

    if (dateParam) setSelectedDate(dateParam);
    if (slotParam) setSelectedSlot(slotParam);
    if (guestsParam) {
      const parsed = Number(guestsParam);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 8) {
        setPartySize(parsed);
      }
    }
    if (zoneParam && ["rooftop", "main-hall", "private-lounge", "all"].includes(zoneParam)) {
      setActiveZoneSlug(zoneParam);
    }
    if (tableParam) {
      setSelectedTableCode(tableParam.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick header hold timer
  useEffect(() => {
    if (!heldTable?.expiresAt) return;
    setHeaderCountdown(formatCountdown(heldTable.expiresAt));
    const timer = window.setInterval(() => {
      setHeaderCountdown(formatCountdown(heldTable.expiresAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [heldTable?.expiresAt]);

  const { data: zones } = useQuery({
    queryKey: ["reserve-zones", selectedDate, selectedSlot],
    queryFn: async () => {
      try {
        const res = await fetchZones(selectedDate, selectedSlot);
        return res.length > 0 ? res : FALLBACK_ZONES;
      } catch {
        return FALLBACK_ZONES;
      }
    },
    initialData: FALLBACK_ZONES,
  });

  const {
    data: tables,
    refetch: refetchTables,
  } = useQuery({
    queryKey: ["reserve-tables", selectedDate, selectedSlot, sessionId],
    queryFn: async () => {
      try {
        const res = await fetchTables({
          date: selectedDate,
          timeSlot: selectedSlot,
          sessionId,
        });
        return res.length > 0 ? res : FALLBACK_TABLES;
      } catch {
        return FALLBACK_TABLES;
      }
    },
    initialData: FALLBACK_TABLES,
    refetchInterval: 15000,
  });

  const { data: menuItems } = useQuery({
    queryKey: ["reserve-menu"],
    queryFn: async () => {
      try {
        const res = await fetchMenuItems();
        return res.length > 0 ? res : FALLBACK_MENU_ITEMS;
      } catch {
        return FALLBACK_MENU_ITEMS;
      }
    },
    initialData: FALLBACK_MENU_ITEMS,
  });

  const selectedTable =
    tables.find((t) => t.table_code === (selectedTableCode || heldTable?.tableCode)) ||
    null;

  const handleHoldTable = async (table: RestaurantTable) => {
    setSelectedTableCode(table.table_code);
    setHoldError(null);
    if (table.status === "BOOKED" || table.status === "HELD_BY_OTHERS") {
      setHoldError(
        `Table ${table.table_code} is ${
          table.status === "BOOKED" ? "already booked" : "currently held by another guest"
        } for ${selectedSlot}.`
      );
      return;
    }

    setIsHolding(true);
    try {
      const sid = getOrCreateSessionId();
      setSessionId(sid);

      if (heldTable && heldTable.tableCode !== table.table_code) {
        await releaseTableHold({
          tableCode: heldTable.tableCode,
          reservationDate: heldTable.reservationDate,
          timeSlot: heldTable.timeSlot,
          sessionId: sid,
        }).catch(() => {});
      }

      const hold = await holdTable({
        tableCode: table.table_code,
        reservationDate: selectedDate,
        timeSlot: selectedSlot,
        sessionId: sid,
        partySize,
      });

      setHeldTable({
        tableCode: hold.table_code,
        reservationDate: hold.reservation_date,
        timeSlot: hold.time_slot,
        expiresAt: hold.expires_at,
      });
      await refetchTables();
    } catch (err) {
      setHoldError(
        err instanceof Error
          ? err.message
          : "Unable to acquire distributed Redis seat lock."
      );
    } finally {
      setIsHolding(false);
    }
  };

  const handleReleaseHold = async () => {
    if (!heldTable) return;
    try {
      await releaseTableHold({
        tableCode: heldTable.tableCode,
        reservationDate: heldTable.reservationDate,
        timeSlot: heldTable.timeSlot,
        sessionId: getOrCreateSessionId(),
      });
      setHeldTable(null);
      await refetchTables();
    } catch (err) {
      setHoldError(err instanceof Error ? err.message : "Could not release hold.");
    }
  };

  const handleQuickSelectBestQuiet = () => {
    const t04 =
      tables.find((t) => t.table_code === "T-04" && t.status === "AVAILABLE") ||
      tables.find((t) => t.is_quiet_zone && t.status === "AVAILABLE") ||
      tables.find((t) => t.status === "AVAILABLE") ||
      tables[0];
    if (t04) {
      setActiveZoneSlug(t04.zone_slug);
      void handleHoldTable(t04);
    }
  };

  const scrollToMenu = () => {
    const el = document.getElementById("menu");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-obsidian pt-28 pb-20 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* Studio Header + Live Hold Telemetry */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 border-b border-brass/20 pb-6">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-brass">
            01 / Interactive 2D Architectural Seat-Picker
          </span>
          <h1 className="mt-2 font-display text-3xl sm:text-5xl uppercase tracking-[0.06em] text-cream leading-[1.04]">
            Lock Your Table &amp;{" "}
            <span className="font-serif italic font-normal normal-case tracking-normal text-brass">
              Acoustic Angle
            </span>
          </h1>
        </div>

        {/* Live Session Controls + Hold Timer */}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 px-3.5 py-2 bg-charcoal border border-brass/25 text-xs">
            <Calendar className="w-3.5 h-3.5 text-brass" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-mono text-xs text-cream focus:outline-none [color-scheme:dark]"
            />
          </label>

          <div className="flex items-center gap-1 p-1 bg-charcoal border border-brass/25">
            <Clock className="w-3.5 h-3.5 text-brass ml-2 mr-1" />
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className={`px-3 py-1 font-mono text-xs tabular-nums transition-colors ${
                  selectedSlot === slot
                    ? "bg-brass text-obsidian font-semibold"
                    : "text-sand hover:text-cream"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-charcoal border border-brass/25 font-mono text-xs">
            <Users className="w-3.5 h-3.5 text-brass" />
            <button
              type="button"
              onClick={() => setPartySize(Math.max(1, partySize - 1))}
              aria-label="Decrease guests"
              className="w-5 h-5 border border-brass/30 flex items-center justify-center text-sand hover:text-cream hover:border-brass transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-cream tabular-nums w-14 text-center">{partySize} Guests</span>
            <button
              type="button"
              onClick={() => setPartySize(Math.min(8, partySize + 1))}
              aria-label="Increase guests"
              className="w-5 h-5 border border-brass/30 flex items-center justify-center text-sand hover:text-cream hover:border-brass transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {heldTable && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-obsidian border border-brass text-brass font-mono text-xs tabular-nums">
              <Lock className="w-3.5 h-3.5" />
              <span>
                {heldTable.tableCode} HELD &bull; {headerCountdown}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Zone Switcher Tabs + Vibe Overlay Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveZoneSlug("all")}
            className={`px-4 py-2 border font-syne text-[10px] uppercase tracking-[0.2em] transition-colors ${
              activeZoneSlug === "all"
                ? "bg-brass border-brass text-obsidian font-bold"
                : "bg-charcoal border-brass/25 text-sand hover:border-brass hover:text-cream"
            }`}
          >
            All 3 Wings (18)
          </button>
          {zones.map((zone) => (
            <button
              key={zone.slug}
              type="button"
              onClick={() => setActiveZoneSlug(zone.slug)}
              className={`px-4 py-2 border font-syne text-[10px] uppercase tracking-[0.2em] transition-colors flex items-center gap-2 ${
                activeZoneSlug === zone.slug
                  ? "bg-brass border-brass text-obsidian font-bold"
                  : "bg-charcoal border-brass/25 text-sand hover:border-brass hover:text-cream"
              }`}
            >
              <span>{zone.name}</span>
              <span className="font-mono text-[10px] opacity-80 tabular-nums">
                ({zone.ambient_noise_db} dB)
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-charcoal border border-brass/25 self-start md:self-auto">
          <span className="font-syne text-[10px] uppercase tracking-[0.18em] text-sand px-2.5">
            Overlay:
          </span>
          <button
            type="button"
            onClick={() => setVibeOverlay("none")}
            className={`px-3 py-1 font-mono text-[11px] transition-colors ${
              vibeOverlay === "none"
                ? "bg-obsidian text-cream border border-brass/35"
                : "text-sand hover:text-cream"
            }`}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setVibeOverlay((v) => (v === "quiet" ? "none" : "quiet"))}
            className={`inline-flex items-center gap-1 px-3 py-1 font-mono text-[11px] transition-colors ${
              vibeOverlay === "quiet"
                ? "bg-sage/20 text-sage border border-sage/50"
                : "text-sand hover:text-cream"
            }`}
          >
            <Volume2 className="w-3 h-3" />
            Quiet Zones
          </button>
          <button
            type="button"
            onClick={() => setVibeOverlay((v) => (v === "window" ? "none" : "window"))}
            className={`inline-flex items-center gap-1 px-3 py-1 font-mono text-[11px] transition-colors ${
              vibeOverlay === "window"
                ? "bg-brass/20 text-brass border border-brass/50"
                : "text-sand hover:text-cream"
            }`}
          >
            <Eye className="w-3 h-3" />
            Skyline Windows
          </button>
        </div>
      </div>

      {/* Main 65% / 35% Split Canvas + Perspective Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <FloorplanSvg
            tables={tables}
            activeZoneSlug={activeZoneSlug}
            selectedTableCode={selectedTableCode}
            heldTableCode={heldTable?.tableCode || null}
            vibeOverlay={vibeOverlay}
            onSelectTable={(t) => void handleHoldTable(t)}
          />
        </div>

        <div className="lg:col-span-4">
          <TablePerspectiveDrawer
            selectedTable={selectedTable}
            heldTable={heldTable}
            holdError={holdError}
            isHolding={isHolding}
            onHoldTable={(t) => void handleHoldTable(t)}
            onReleaseHold={() => void handleReleaseHold()}
            onScrollToMenu={scrollToMenu}
            onQuickSelectBestQuiet={handleQuickSelectBestQuiet}
          />
        </div>
      </div>

      {/* Phase 3 View 3: Shared-Layout Dish Customizer & Pre-Order Tray */}
      <MenuCustomizerSection
        menuItems={menuItems}
        initialDishSlug={searchParams.get("dish") || undefined}
      />
    </div>
  );
}

export default function ReservePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-obsidian pt-32 px-8 text-center font-mono text-sm text-brass">
          Loading Nocturne Floorplan Studio...
        </div>
      }
    >
      <ReserveStudioContent />
    </Suspense>
  );
}
