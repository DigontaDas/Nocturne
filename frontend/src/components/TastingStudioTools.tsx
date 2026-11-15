"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Check,
  Compass,
  Flame,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { formatBdt } from "@/lib/api";
import { getDishImageClass } from "@/lib/dish-media";
import {
  buildBudgetSequence,
  createDefaultTrayItem,
  FlightStyle,
} from "@/lib/tasting-logic";
import { useReservationContext } from "@/context/ReservationContext";
import { DishCustomizerModal } from "@/components/DishCustomizerModal";
import { MenuItem } from "@/types/nocturne";

const BUDGET_PRESETS = [2500, 4000, 6000, 8500] as const;

const FLIGHT_STYLES: Array<{ id: FlightStyle; label: string; hint: string }> = [
  { id: "balanced", label: "Balanced 3-Course", hint: "Starter, Main & Pairing" },
  { id: "high-protein", label: "High-Protein Oak", hint: "Maximum lean protein" },
  { id: "light", label: "Light & Botanical", hint: "Low kcal · Bright finish" },
];

const COURSE_ORDER = [
  "Small Plates",
  "Wood-Fired Steaks",
  "Artisanal Pasta",
  "Botanical Mocktails",
  "Desserts",
] as const;

interface TastingBudgetPlannerProps {
  menuItems: MenuItem[];
  dairyFreeOnly: boolean;
  nutFreeOnly: boolean;
  glutenFreeOnly: boolean;
  onInspectDish?: (slug: string) => void;
}

export function TastingBudgetPlanner({
  menuItems,
  dairyFreeOnly,
  nutFreeOnly,
  glutenFreeOnly,
  onInspectDish,
}: TastingBudgetPlannerProps) {
  const { addTrayItem } = useReservationContext();
  const [maxBdt, setMaxBdt] = useState<number>(6000);
  const [style, setStyle] = useState<FlightStyle>("balanced");
  const [appliedFlash, setAppliedFlash] = useState<boolean>(false);

  const recommended = useMemo(
    () =>
      buildBudgetSequence(menuItems, {
        maxBdt,
        style,
        dairyFreeOnly,
        nutFreeOnly,
        glutenFreeOnly,
      }),
    [menuItems, maxBdt, style, dairyFreeOnly, nutFreeOnly, glutenFreeOnly]
  );

  const handleApplySequence = () => {
    if (!recommended) return;
    for (const dish of recommended.dishes) {
      addTrayItem(createDefaultTrayItem(dish));
    }
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 1800);
  };

  return (
    <div className="mb-8 border border-brass/25 bg-charcoal/55 p-5 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-brass/20 pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-brass">
            Algorithmic Sommelier Planner
          </span>
          <h3 className="mt-1 font-display text-lg sm:text-xl uppercase tracking-[0.08em] text-cream">
            Curate Sequence by{" "}
            <span className="font-serif italic font-normal normal-case tracking-normal text-brass">
              Budget &amp; Palate
            </span>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-sand/75 mr-1">
            Per-Guest Cap:
          </span>
          {BUDGET_PRESETS.map((cap) => {
            const active = maxBdt === cap;
            return (
              <button
                key={cap}
                type="button"
                onClick={() => setMaxBdt(cap)}
                className={`px-3 py-1.5 border font-mono text-[11px] tabular-nums transition-colors ${
                  active
                    ? "border-brass bg-brass text-obsidian font-semibold"
                    : "border-brass/25 bg-obsidian text-sand hover:border-brass hover:text-cream"
                }`}
              >
                {formatBdt(cap)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Style selector */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sand/75">
            Progression Focus
          </div>
          <div className="space-y-2 flex-1 flex flex-col justify-center">
            {FLIGHT_STYLES.map((opt) => {
              const active = style === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStyle(opt.id)}
                  className={`w-full text-left px-3.5 py-2.5 border transition-colors flex items-center justify-between gap-3 ${
                    active
                      ? "border-brass bg-brass/14 text-cream"
                      : "border-brass/20 bg-obsidian/70 text-sand hover:border-brass/45"
                  }`}
                >
                  <div>
                    <div className="font-sans text-xs font-semibold uppercase tracking-[0.14em]">
                      {opt.label}
                    </div>
                    <div className="font-sans text-[11px] text-sand/75 font-light">
                      {opt.hint}
                    </div>
                  </div>
                  <span
                    className={`w-2 h-2 border ${
                      active ? "bg-brass border-brass" : "border-brass/40"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Recommended Sequence */}
        <div className="lg:col-span-8 border border-brass/20 bg-obsidian/85 p-4 flex flex-col justify-between gap-4">
          {recommended ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brass/15 pb-3">
                <div>
                  <div className="font-serif italic text-xl text-cream leading-tight">
                    {recommended.label}
                  </div>
                  <p className="font-sans text-xs text-sand/80 font-light mt-0.5">
                    {recommended.subtitle}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-lg font-semibold text-brass">
                    {formatBdt(recommended.totalPriceBdt)}
                  </div>
                  <div className="text-[10px] text-sand/80">
                    {recommended.totalKcal} kcal &bull; {recommended.totalProtein}g P &bull; ~
                    {recommended.maxPrepMins}m pass
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {recommended.dishes.map((dish, idx) => (
                  <div
                    key={dish.id}
                    className="border border-brass/20 bg-charcoal/65 p-2.5 flex items-center gap-2.5"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-obsidian border border-brass/30 shrink-0">
                      <img
                        src={dish.image_url}
                        alt={dish.name}
                        className={getDishImageClass(dish.image_url, "mix-blend-lighten")}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-brass">
                        Course 0{idx + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => onInspectDish?.(dish.slug)}
                        className="font-serif italic text-sm text-cream hover:text-brass transition-colors leading-tight truncate block text-left w-full"
                      >
                        {dish.name}
                      </button>
                      <div className="font-mono text-[10px] text-sand/80 tabular-nums">
                        {formatBdt(dish.base_price_bdt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-sage">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>100% Zabiha Halal</span>
                  {(dairyFreeOnly || nutFreeOnly || glutenFreeOnly) && (
                    <span className="text-sand/85">
                      &bull; Matches active allergen matrix
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleApplySequence}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brass hover:bg-brass-soft text-obsidian font-sans text-[11px] font-bold uppercase tracking-[0.16em] transition-colors"
                >
                  {appliedFlash ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Sequence Loaded to Tray</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Load Recommended Sequence</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="py-8 text-center font-sans text-xs text-sand/80">
              Adjust your allergen filters above to reveal eligible tasting sequences.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TastingLedgerGridProps {
  dishes: MenuItem[];
  onInspectOnWheel: (slug: string) => void;
}

export function TastingLedgerGrid({
  dishes,
  onInspectOnWheel,
}: TastingLedgerGridProps) {
  const { addTrayItem } = useReservationContext();
  const [customizerDish, setCustomizerDish] = useState<MenuItem | null>(null);
  const [addedId, setAddedId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    return COURSE_ORDER.map((category) => ({
      category,
      items: dishes.filter((d) => d.category === category),
    })).filter((group) => group.items.length > 0);
  }, [dishes]);

  const handleQuickAdd = (dish: MenuItem) => {
    addTrayItem(createDefaultTrayItem(dish));
    setAddedId(dish.id);
    window.setTimeout(() => {
      setAddedId((prev) => (prev === dish.id ? null : prev));
    }, 1500);
  };

  return (
    <div className="p-5 sm:p-7 space-y-8 bg-obsidian">
      {grouped.map((group, groupIdx) => (
        <div key={group.category} className="space-y-4">
          <div className="flex items-center justify-between border-b border-brass/20 pb-2.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
                0{groupIdx + 1}
              </span>
              <h3 className="font-display text-lg sm:text-xl uppercase tracking-[0.1em] text-cream">
                {group.category}
              </h3>
            </div>
            <span className="font-mono text-[10px] text-sand/75 uppercase tracking-wider">
              {group.items.length} {group.items.length === 1 ? "Plate" : "Plates"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {group.items.map((dish) => {
              const heat = Math.max(0, Math.min(3, dish.spice_level || 0));
              return (
                <article
                  key={dish.id}
                  className="border border-brass/25 bg-charcoal/70 hover:border-brass/60 transition-colors p-4 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-obsidian border border-brass/35 shrink-0">
                      <img
                        src={dish.image_url}
                        alt={dish.name}
                        className={getDishImageClass(dish.image_url, "mix-blend-lighten")}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-serif italic text-xl text-cream leading-tight">
                          {dish.name}
                        </h4>
                        <span className="font-mono text-xs font-semibold text-brass tabular-nums shrink-0">
                          {formatBdt(dish.base_price_bdt)}
                        </span>
                      </div>

                      <div className="mt-1 font-mono text-[10px] text-sand/80 tabular-nums">
                        {dish.calories_kcal} kcal &bull; {dish.protein_grams}g P &bull;{" "}
                        {dish.prep_time_mins}m
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {dish.is_dairy_free && (
                          <span className="px-1.5 py-0.5 border border-sage/45 bg-sage/12 text-sage font-mono text-[9px] uppercase">
                            DF
                          </span>
                        )}
                        {dish.is_nut_free && (
                          <span className="px-1.5 py-0.5 border border-sage/45 bg-sage/12 text-sage font-mono text-[9px] uppercase">
                            NF
                          </span>
                        )}
                        {dish.is_gluten_free && (
                          <span className="px-1.5 py-0.5 border border-sage/45 bg-sage/12 text-sage font-mono text-[9px] uppercase">
                            GF
                          </span>
                        )}
                        {heat > 0 && (
                          <span className="inline-flex items-center gap-0.5 font-mono text-[9px] text-ember uppercase ml-1">
                            <Flame className="w-2.5 h-2.5" />
                            L{heat}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="font-sans text-xs text-sand/85 font-light leading-relaxed line-clamp-2">
                    {dish.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-brass/15">
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(dish)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-brass hover:bg-brass-soft text-obsidian font-sans text-[10px] font-bold uppercase tracking-[0.16em] transition-colors"
                    >
                      {addedId === dish.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setCustomizerDish(dish)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 border border-brass/35 hover:border-brass text-cream font-sans text-[10px] uppercase tracking-[0.14em] transition-colors"
                      title="Customize portions, spice & sides"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-brass" />
                      <span>Customize</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onInspectOnWheel(dish.slug)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 border border-brass/20 hover:border-brass text-sand hover:text-brass font-sans text-[10px] uppercase tracking-[0.14em] transition-colors"
                      title="Spin Tasting Wheel to this plate"
                    >
                      <Compass className="w-3 h-3" />
                      <span>Wheel</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}

      <AnimatePresence>
        {customizerDish && (
          <DishCustomizerModal
            dish={customizerDish}
            onClose={() => setCustomizerDish(null)}
            onAddToTray={addTrayItem}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
