"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Calendar,
  Clock,
  Eye,
  Lock,
  Minus,
  Plus,
  Search,
  Users,
  Volume2,
} from "lucide-react";
import {
  fetchMenuItems,
  fetchTables,
  fetchZones,
  getOrCreateSessionId,
  holdTable,
  lookupReservations,
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
import { ReservationOut, RestaurantTable } from "@/types/nocturne";

const TIME_SLOTS = ["19:00", "20:30", "22:00"] as const;

function ReserveStudioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lookupInput, setLookupInput] = useState<string>("");
  const [lookupResults, setLookupResults] = useState<ReservationOut[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState<boolean>(false);
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

  const handleLookupBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lookupInput.trim();
    if (!clean) return;
    setLookingUp(true);
    setLookupError(null);
    setLookupResults(null);
    try {
      const upper = clean.toUpperCase();
      if (upper.startsWith("NOC-")) {
        router.push(`/booking/${encodeURIComponent(upper)}`);
        return;
      }
      const matches = await lookupReservations({ phone: clean });
      if (matches.length === 1) {
        router.push(`/booking/${encodeURIComponent(matches[0].reference_code)}`);
        return;
      }
      if (matches.length === 0) {
        setLookupError("No bookings found matching that phone number or reference code.");
      } else {
        setLookupResults(matches);
      }
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : "Could not look up reservation right now."
      );
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian pt-28 pb-20 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* Header & Dining Window Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-6 border-b border-brass/20 pb-6">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-brass">
            Floorplan &amp; Table Selection
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
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveZoneSlug("all")}
            className={`shrink-0 px-4 py-2 border font-syne text-[10px] uppercase tracking-[0.2em] transition-colors ${
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
              className={`shrink-0 px-4 py-2 border font-syne text-[10px] uppercase tracking-[0.2em] transition-colors flex items-center gap-2 ${
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

        <div className="flex items-center gap-1 p-1 bg-charcoal border border-brass/25 self-start md:self-auto overflow-x-auto no-scrollbar max-w-full">
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

      {/* Find or Manage Existing Reservation */}
      <div className="mb-6 bg-charcoal/55 border border-brass/20 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs font-sans text-sand/90">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass mr-2">
            Manage Booking
          </span>
          Enter a booking reference (<span className="font-mono text-cream">NOC-2026-...</span>) or phone number to review refunds, cancel, or settle early.
        </div>

        <form onSubmit={handleLookupBooking} className="flex items-stretch gap-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-obsidian border border-brass/25 focus-within:border-brass">
            <Search className="w-3.5 h-3.5 text-brass/80" />
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="NOC-2026-9941 or +88017..."
              aria-label="Lookup booking by reference code or phone"
              className="bg-transparent font-mono text-xs text-cream placeholder:text-sand/50 focus:outline-none w-48 sm:w-56"
            />
          </div>
          <button
            type="submit"
            disabled={lookingUp || !lookupInput.trim()}
            className="px-4 py-1.5 bg-obsidian border border-brass/45 hover:border-brass hover:bg-brass hover:text-obsidian disabled:opacity-50 text-brass font-syne text-[10px] font-bold uppercase tracking-[0.18em] transition-colors flex items-center gap-1.5"
          >
            <span>{lookingUp ? "Finding..." : "Open Pass"}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </form>
      </div>

      {lookupError && (
        <div className="mb-5 border border-ember/40 bg-ember/10 px-4 py-2.5 text-xs font-mono text-ember">
          {lookupError}
        </div>
      )}

      {lookupResults && lookupResults.length > 0 && (
        <div className="mb-6 border border-brass/30 bg-charcoal p-4 space-y-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass">
            Matching Reservations ({lookupResults.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {lookupResults.map((res) => (
              <Link
                key={res.reference_code}
                href={`/booking/${res.reference_code}`}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-obsidian border border-brass/25 hover:border-brass transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-brass font-semibold">
                    {res.reference_code} &bull; {res.table_code}
                  </div>
                  <div className="font-sans text-[11px] text-sand truncate">
                    {res.reservation_date} @ {res.time_slot} &middot; {res.status}
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-brass shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main 65% / 35% Split Canvas + Perspective Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          <FloorplanSvg
            tables={tables}
            activeZoneSlug={activeZoneSlug}
            selectedTableCode={selectedTableCode}
            heldTableCode={heldTable?.tableCode || null}
            vibeOverlay={vibeOverlay}
            onSelectTable={(t) => void handleHoldTable(t)}
          />

          {/* Mobile & Tablet Thumb-Friendly Quick Seat Strip */}
          <div className="lg:hidden border border-brass/25 bg-charcoal/80 p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brass">
                Tap Seat Directly ({activeZoneSlug === "all" ? "All Wings" : activeZoneSlug})
              </span>
              <span className="font-mono text-[10px] text-sand/75">
                Swipe horizontally &rarr;
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {tables
                .filter((t) =>
                  activeZoneSlug === "all" ? true : t.zone_slug === activeZoneSlug
                )
                .filter((t) => {
                  if (vibeOverlay === "quiet") return t.noise_db <= 52;
                  if (vibeOverlay === "window") return t.is_window_side;
                  return true;
                })
                .map((t) => {
                  const isMine = heldTable?.tableCode === t.table_code;
                  const isSelected = selectedTableCode === t.table_code;
                  const isUnavailable =
                    (t.status === "BOOKED" || t.status === "HELD_BY_OTHERS") && !isMine;
                  return (
                    <button
                      key={t.table_code}
                      type="button"
                      disabled={isUnavailable}
                      onClick={() => void handleHoldTable(t)}
                      className={`shrink-0 px-3 py-2 border text-left transition-colors min-w-[116px] ${
                        isMine || isSelected
                          ? "bg-brass/18 border-brass text-cream"
                          : isUnavailable
                            ? "bg-obsidian/45 border-brass/15 text-sand/45 opacity-60 cursor-not-allowed"
                            : "bg-obsidian border-brass/25 text-sand hover:border-brass"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-brass">
                          {t.table_code}
                        </span>
                        <span className="font-mono text-[10px] text-cream/80 tabular-nums">
                          {t.capacity_max}P
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-sand/80 mt-0.5 tabular-nums">
                        {t.noise_db} dB &middot;{" "}
                        {isMine
                          ? "Held"
                          : t.status === "BOOKED"
                            ? "Booked"
                            : t.status === "HELD_BY_OTHERS"
                              ? "Held"
                              : "Open"}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
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
          Loading Nocturne Floorplan...
        </div>
      }
    >
      <ReserveStudioContent />
    </Suspense>
  );
}
