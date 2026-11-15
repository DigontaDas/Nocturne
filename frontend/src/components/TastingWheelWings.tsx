"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Flame, Layers, ShieldCheck } from "lucide-react";
import { formatBdt } from "@/lib/api";
import { getDishImageClass } from "@/lib/dish-media";
import {
  createDefaultTrayItem,
  CuratedFlight,
  DishPairingSuggestion,
  evaluateTrayAllergens,
} from "@/lib/tasting-logic";
import { useReservationContext } from "@/context/ReservationContext";
import { MenuItem } from "@/types/nocturne";

interface TastingWheelWingsProps {
  activeDish: MenuItem;
  pairing: DishPairingSuggestion | null;
  flights: CuratedFlight[];
  mode: "pinned" | "interactive";
  onJumpToDishSlug?: (slug: string) => void;
}

export function TastingWheelWings({
  activeDish,
  pairing,
  flights,
  mode,
  onJumpToDishSlug,
}: TastingWheelWingsProps) {
  const { addTrayItem, trayItems, openConciergeWithPrompt } =
    useReservationContext();

  const [selectedFlightIndex, setSelectedFlightIndex] = useState<number>(0);
  const [duoAddedForSlug, setDuoAddedForSlug] = useState<string | null>(null);
  const [flightAddedId, setFlightAddedId] = useState<string | null>(null);

  const selectedFlight = flights[selectedFlightIndex] ?? flights[0] ?? null;
  const trayAudit = evaluateTrayAllergens(trayItems);
  const clampedSpice = Math.max(0, Math.min(3, activeDish.spice_level || 0));

  const handleAddDuo = () => {
    addTrayItem(createDefaultTrayItem(activeDish));
    if (pairing) {
      addTrayItem(createDefaultTrayItem(pairing.dish));
    }
    setDuoAddedForSlug(activeDish.slug);
    window.setTimeout(() => {
      setDuoAddedForSlug((prev) => (prev === activeDish.slug ? null : prev));
    }, 1800);
  };

  const handleLoadFlight = () => {
    if (!selectedFlight) return;
    for (const course of selectedFlight.dishes) {
      addTrayItem(createDefaultTrayItem(course));
    }
    setFlightAddedId(selectedFlight.id);
    window.setTimeout(() => {
      setFlightAddedId((prev) => (prev === selectedFlight.id ? null : prev));
    }, 1800);
  };

  return (
    <div className="relative z-40 w-full max-w-6xl mx-auto px-4 mt-8 md:mt-[605px] lg:mt-0 lg:static grid grid-cols-1 md:grid-cols-2 lg:block gap-4 pointer-events-auto">
      {/* LEFT WING: Heat Scale, Allergen Shields & Dynamic Zero-Proof Pairing */}
      <div className="lg:absolute lg:bottom-4 lg:left-5 xl:left-8 lg:w-[258px] xl:w-[322px] border border-brass/25 bg-charcoal/88 backdrop-blur-md p-3 space-y-2 text-left shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-brass/20 pb-1.5">
          <div className="flex items-center gap-1.5" aria-label={`Heat level ${clampedSpice} of 3`}>
            <Flame className="w-3 h-3 text-ember" />
            {[0, 1, 2].map((level) => (
              <span
                key={level}
                className={`h-1.5 w-3.5 ${
                  clampedSpice > level ? "bg-ember" : "bg-brass/20"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider">
            <span
              className={`px-1.5 py-0.5 border ${
                activeDish.is_dairy_free
                  ? "border-sage/50 bg-sage/15 text-sage"
                  : "border-brass/20 text-sand/55"
              }`}
              title={activeDish.is_dairy_free ? "Dairy-Free safe line" : "Contains Dairy"}
            >
              DF
            </span>
            <span
              className={`px-1.5 py-0.5 border ${
                activeDish.is_nut_free
                  ? "border-sage/50 bg-sage/15 text-sage"
                  : "border-brass/20 text-sand/55"
              }`}
              title={activeDish.is_nut_free ? "Nut-Free safe line" : "Contains Tree Nuts"}
            >
              NF
            </span>
            <span
              className={`px-1.5 py-0.5 border ${
                activeDish.is_gluten_free
                  ? "border-sage/50 bg-sage/15 text-sage"
                  : "border-brass/20 text-sand/55"
              }`}
              title={activeDish.is_gluten_free ? "Gluten-Free safe line" : "Contains Gluten"}
            >
              GF
            </span>
          </div>
        </div>

        {pairing && (
          <div className="border border-brass/20 bg-obsidian/80 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-obsidian border border-brass/30 shrink-0">
                <img
                  src={pairing.dish.image_url}
                  alt={pairing.dish.name}
                  className={getDishImageClass(pairing.dish.image_url, "mix-blend-lighten")}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-brass">
                    Chef Match
                  </span>
                  <span className="font-mono text-[10px] text-cream tabular-nums">
                    {formatBdt(pairing.dish.base_price_bdt)}
                  </span>
                </div>
                <div className="font-serif italic text-sm text-cream leading-tight truncate">
                  {pairing.dish.name}
                </div>
              </div>
            </div>

            <p className="font-sans text-[10.5px] text-sand/85 font-light leading-snug line-clamp-1">
              {pairing.rationale}
            </p>

            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleAddDuo}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-brass/15 hover:bg-brass hover:text-obsidian border border-brass/40 text-brass font-sans text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors"
              >
                {duoAddedForSlug === activeDish.slug ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Duo Added</span>
                  </>
                ) : (
                  <span className="tabular-nums">
                    + Add Duo ({formatBdt(pairing.combinedPriceBdt)})
                  </span>
                )}
              </button>

              {onJumpToDishSlug && (
                <button
                  type="button"
                  onClick={() => onJumpToDishSlug(pairing.dish.slug)}
                  className="px-2 py-1.5 border border-brass/25 hover:border-brass text-[9.5px] font-sans uppercase tracking-[0.12em] text-sand hover:text-cream transition-colors shrink-0"
                  title={`Spin wheel to ${pairing.dish.name}`}
                >
                  Inspect
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT WING: Curated 3-Course Tasting Flight Builder & Studio Bridge */}
      <div className="lg:absolute lg:bottom-4 lg:right-5 xl:right-8 lg:w-[258px] xl:w-[322px] border border-brass/25 bg-charcoal/88 backdrop-blur-md p-3 space-y-2 text-left shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-brass/20 pb-1.5">
          <span className="inline-flex items-center gap-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-brass">
            <Layers className="w-3 h-3" />
            <span>Chef&apos;s Flight</span>
          </span>
          {trayAudit.itemCount > 0 ? (
            <span className="font-mono text-[10px] text-sage tabular-nums">
              {trayAudit.itemCount} queued &bull; {formatBdt(trayAudit.totalPriceBdt)}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-sand/75">
              3-Course Trio
            </span>
          )}
        </div>

        {flights.length > 0 && selectedFlight && (
          <>
            <div className="grid grid-cols-3 gap-1">
              {flights.map((flight, idx) => {
                const isSelected = idx === selectedFlightIndex;
                return (
                  <button
                    key={flight.id}
                    type="button"
                    onClick={() => setSelectedFlightIndex(idx)}
                    className={`px-1.5 py-1 border font-sans text-[9.5px] uppercase tracking-[0.08em] truncate transition-colors ${
                      isSelected
                        ? "border-brass bg-brass/18 text-cream font-semibold"
                        : "border-brass/20 bg-obsidian/65 text-sand hover:border-brass/45 hover:text-cream"
                    }`}
                  >
                    {flight.label.split(" ")[0]}
                  </button>
                );
              })}
            </div>

            <div className="border border-brass/20 bg-obsidian/80 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif italic text-sm text-cream leading-none truncate">
                  {selectedFlight.label}
                </span>
                <span className="font-mono text-[10.5px] text-brass font-medium tabular-nums shrink-0">
                  {formatBdt(selectedFlight.totalPriceBdt)}
                </span>
              </div>

              <div className="font-sans text-[10.5px] text-sand/85 leading-snug line-clamp-2">
                {selectedFlight.dishes.map((c, idx) => `0${idx + 1} ${c.name}`).join(" · ")}
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleLoadFlight}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-brass hover:bg-brass-soft text-obsidian font-sans text-[10px] font-bold uppercase tracking-[0.14em] transition-colors"
                >
                  {flightAddedId === selectedFlight.id ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Flight Queued</span>
                    </>
                  ) : (
                    <span>+ Load 3-Course Flight</span>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2 text-[9.5px] font-sans uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={() =>
              openConciergeWithPrompt(
                `How should I pair ${activeDish.name} (${formatBdt(activeDish.base_price_bdt)}) with a quiet table and allergen-safe sides?`
              )
            }
            className="inline-flex items-center gap-1 text-sand hover:text-brass transition-colors"
          >
            <ShieldCheck className="w-3 h-3 text-sage" />
            <span>Ask Sommelier</span>
          </button>

          <Link
            href={mode === "pinned" ? "/menu" : "/reserve"}
            className="inline-flex items-center gap-1 text-brass hover:text-cream transition-colors font-semibold"
          >
            <span>{mode === "pinned" ? "Full Tasting Studio" : "Pair with Seat"}</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
