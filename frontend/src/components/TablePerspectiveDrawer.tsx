"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Clock,
  Compass,
  Lock,
  Unlock,
  Users,
  Volume2,
} from "lucide-react";
import { RestaurantTable } from "@/types/nocturne";
import { HeldTableState } from "@/context/ReservationContext";

interface TablePerspectiveDrawerProps {
  selectedTable: RestaurantTable | null;
  heldTable: HeldTableState | null;
  holdError: string | null;
  isHolding: boolean;
  onHoldTable: (table: RestaurantTable) => void;
  onReleaseHold: () => void;
  onScrollToMenu: () => void;
  onQuickSelectBestQuiet: () => void;
}

export function formatCountdown(expiresAtIso: string | undefined): string {
  if (!expiresAtIso) return "10:00";
  const diffMs = Math.max(0, new Date(expiresAtIso).getTime() - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function TablePerspectiveDrawer({
  selectedTable,
  heldTable,
  holdError,
  isHolding,
  onHoldTable,
  onReleaseHold,
  onScrollToMenu,
  onQuickSelectBestQuiet,
}: TablePerspectiveDrawerProps) {
  const [countdown, setCountdown] = useState<string>(() =>
    formatCountdown(heldTable?.expiresAt)
  );

  useEffect(() => {
    if (!heldTable?.expiresAt) return;
    setCountdown(formatCountdown(heldTable.expiresAt));
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(heldTable.expiresAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [heldTable?.expiresAt]);

  if (!selectedTable) {
    return (
      <aside className="rounded-3xl bg-charcoal hairline-brass p-6 sm:p-7 flex flex-col justify-between min-h-[540px] shadow-card">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-brass">
            Table Perspective Drawer
          </span>
          <h2 className="mt-3 font-serif text-3xl text-cream leading-tight">
            Select Your Exact{" "}
            <span className="italic text-brass font-light">Sightline</span>
          </h2>
          <p className="mt-3 text-sm text-sand font-light leading-relaxed">
            Click any emerald or brass table marker on the architectural floorplan to inspect
            its first-person Banani view photo, acoustic decibel meter, and trigger a
            10-minute distributed Redis lock.
          </p>

          <div className="mt-6 rounded-2xl overflow-hidden hairline-brass bg-obsidian relative">
            <img
              src="/media/table-window-edge.png"
              alt="Rooftop window-edge preview"
              className="w-full h-48 object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/20 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-mono text-cream">
              <span>Skyline Perspective Preview</span>
              <span className="text-brass">48 dB Alcove</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onQuickSelectBestQuiet}
          className="mt-6 w-full py-3.5 px-5 rounded-full bg-brass hover:bg-brass-soft text-obsidian font-sans font-semibold text-sm flex items-center justify-center transition-all shadow-brass"
        >
          <span>Hold Quietest Sunset Two-Top (T-04)</span>
        </button>
      </aside>
    );
  }

  const isHeldByYou =
    heldTable?.tableCode === selectedTable.table_code ||
    selectedTable.status === "HELD_BY_YOU";
  const isBlocked =
    selectedTable.status === "BOOKED" ||
    (selectedTable.status === "HELD_BY_OTHERS" && !isHeldByYou);

  const noisePercent = Math.min(
    100,
    Math.max(18, ((selectedTable.noise_db - 35) / 40) * 100)
  );

  return (
    <aside className="rounded-3xl bg-charcoal hairline-brass overflow-hidden flex flex-col justify-between min-h-[540px] shadow-card">
      <div>
        {/* First-Person Perspective Photo */}
        <div className="relative h-56 sm:h-60 w-full bg-obsidian overflow-hidden">
          <img
            src={selectedTable.perspective_photo_url}
            alt={`Perspective view from ${selectedTable.table_code}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/25 to-transparent" />

          <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
            <span className="px-3 py-1 glass-obsidian font-mono text-[11px] uppercase tracking-wider text-cream">
              {selectedTable.zone_name}
            </span>
            {isHeldByYou ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-obsidian/90 border border-brass text-brass font-mono text-[11px] tabular-nums">
                <Lock className="w-3 h-3" />
                HOLD {countdown}
              </span>
            ) : selectedTable.status === "HELD_BY_OTHERS" ? (
              <span className="px-3 py-1 bg-ember/20 border border-ember text-ember font-mono text-[11px]">
                HELD BY GUEST
              </span>
            ) : selectedTable.status === "BOOKED" ? (
              <span className="px-3 py-1 bg-obsidian/85 border border-sand/30 text-sand font-mono text-[11px]">
                BOOKED
              </span>
            ) : (
              <span className="px-3 py-1 bg-sage/20 border border-sage text-sage font-mono text-[11px]">
                AVAILABLE
              </span>
            )}
          </div>

          <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
                Table Perspective
              </div>
              <h2 className="font-display text-3xl sm:text-4xl tracking-[0.08em] text-cream leading-none mt-1">
                {selectedTable.table_code}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs text-cream bg-obsidian/85 px-3 py-1.5 border border-brass/30">
              <Users className="w-3.5 h-3.5 text-brass" />
              {selectedTable.capacity_min}–{selectedTable.capacity_max} Guests
            </div>
          </div>
        </div>

        {/* Acoustic Meter & Server Notes */}
        <div className="p-6 space-y-5">
          {holdError && (
            <div className="bg-ember/15 border border-ember/45 p-3.5 flex items-start gap-2.5 text-xs text-cream">
              <AlertTriangle className="w-4 h-4 text-ember shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-ember">Seat Lock Conflict</div>
                <p className="text-sand mt-0.5">{holdError}</p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between font-mono text-xs mb-2">
              <span className="inline-flex items-center gap-1.5 uppercase tracking-wider text-sand">
                <Volume2 className="w-3.5 h-3.5 text-brass" />
                Acoustic Meter
              </span>
              <span className="text-cream tabular-nums font-medium">
                {selectedTable.noise_db} dB &bull;{" "}
                {selectedTable.noise_db <= 55 ? "Whisper / Quiet" : "Lively Pass"}
              </span>
            </div>
            <div className="h-2 bg-obsidian overflow-hidden border border-brass/20">
              <motion.div
                initial={false}
                animate={{ width: `${noisePercent}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 24 }}
                className={`h-full ${
                  selectedTable.noise_db <= 55
                    ? "bg-gradient-to-r from-sage to-brass"
                    : "bg-gradient-to-r from-brass to-ember"
                }`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedTable.is_window_side && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 bg-obsidian border border-brass/35 text-brass">
                <Compass className="w-3 h-3" />
                Skyline Window Sightline
              </span>
            )}
            {selectedTable.is_quiet_zone && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 bg-sage/10 border border-sage/35 text-sage">
                <CheckCircle2 className="w-3 h-3" />
                Quiet Conversation Zone
              </span>
            )}
          </div>

          <p className="text-sm font-sans text-sand font-light leading-relaxed">
            {selectedTable.vibe_notes}
          </p>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="p-6 pt-0 space-y-3">
        {isHeldByYou ? (
          <>
            <div className="bg-obsidian/80 border border-brass/35 px-4 py-3 flex items-center justify-between text-xs font-mono">
              <span className="inline-flex items-center gap-2 text-cream">
                <Clock className="w-3.5 h-3.5 text-brass" />
                Seat locked exclusively for you
              </span>
              <span className="text-brass font-semibold tabular-nums">{countdown}</span>
            </div>

            <button
              type="button"
              onClick={onScrollToMenu}
              data-cursor="RESERVE"
              className="w-full py-3.5 px-5 bg-brass hover:bg-brass-soft text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors"
            >
              <span>Hold Active &bull; Customize Menu</span>
              <ArrowDown className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onReleaseHold}
              className="w-full py-2.5 px-4 border border-brass/30 text-sand hover:text-cream hover:border-brass font-mono text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Release Seat Hold</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={isBlocked || isHolding}
            onClick={() => onHoldTable(selectedTable)}
            data-cursor="RESERVE"
            className="w-full py-3.5 px-5 bg-brass hover:bg-brass-soft disabled:bg-obsidian disabled:text-sand/50 disabled:border disabled:border-brass/15 text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors"
          >
            <Lock className="w-4 h-4" />
            <span>
              {isHolding
                ? "Locking Seat in Redis..."
                : isBlocked
                  ? `Table ${selectedTable.table_code} Unavailable`
                  : `Hold ${selectedTable.table_code} (10-Min Lock)`}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
