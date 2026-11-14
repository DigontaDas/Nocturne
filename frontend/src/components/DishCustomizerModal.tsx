"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Flame, Plus, ShieldCheck, X } from "lucide-react";
import { formatBdt } from "@/lib/api";
import { getDishImageClass } from "@/lib/dish-media";
import { MenuItem, TrayItem } from "@/types/nocturne";

interface DishCustomizerModalProps {
  dish: MenuItem;
  onClose: () => void;
  onAddToTray: (item: TrayItem) => void;
}

export function DishCustomizerModal({
  dish,
  onClose,
  onAddToTray,
}: DishCustomizerModalProps) {
  const portions = useMemo(
    () => dish.customization_schema?.portions || [],
    [dish.customization_schema]
  );
  const spiceLevels = useMemo(
    () => dish.customization_schema?.spice_levels || [],
    [dish.customization_schema]
  );
  const sides = useMemo(
    () => dish.customization_schema?.sides || [],
    [dish.customization_schema]
  );

  const [selectedPortionId, setSelectedPortionId] = useState<string>(
    portions[0]?.id || "standard"
  );
  const [selectedSpiceId, setSelectedSpiceId] = useState<string>(
    spiceLevels[0]?.id || "mild"
  );
  const [selectedSideIds, setSelectedSideIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);

  const toggleSide = (sideId: string) => {
    setSelectedSideIds((prev) =>
      prev.includes(sideId) ? prev.filter((id) => id !== sideId) : [...prev, sideId]
    );
  };

  const totals = useMemo(() => {
    const basePrice = Number(dish.base_price_bdt) || 0;
    const portion = portions.find((p) => p.id === selectedPortionId);
    const spice = spiceLevels.find((s) => s.id === selectedSpiceId);
    const chosenSides = sides.filter((s) => selectedSideIds.includes(s.id));

    const unitPriceBdt =
      basePrice +
      (portion?.delta_bdt || 0) +
      (spice?.delta_bdt || 0) +
      chosenSides.reduce((acc, s) => acc + (s.delta_bdt || 0), 0);

    const caloriesKcal = Math.max(
      20,
      dish.calories_kcal +
        (portion?.delta_kcal || 0) +
        (spice?.delta_kcal || 0) +
        chosenSides.reduce((acc, s) => acc + (s.delta_kcal || 0), 0)
    );

    const proteinGrams = Math.max(
      0,
      dish.protein_grams +
        (portion?.delta_protein || 0) +
        chosenSides.reduce((acc, s) => acc + (s.delta_protein || 0), 0)
    );

    const prepTimeMins = Math.max(
      4,
      dish.prep_time_mins +
        (portion?.delta_prep_mins || 0) +
        chosenSides.reduce((acc, s) => acc + (s.delta_prep_mins || 0), 0)
    );

    return {
      portionLabel: portion?.label || "Standard",
      spiceLabel: spice?.label || undefined,
      sideLabels: chosenSides.map((s) => s.label),
      unitPriceBdt,
      caloriesKcal,
      proteinGrams,
      prepTimeMins,
    };
  }, [dish, portions, spiceLevels, sides, selectedPortionId, selectedSpiceId, selectedSideIds]);

  const handleConfirmAdd = () => {
    const key = `${dish.slug}::${selectedPortionId}::${selectedSpiceId}::${selectedSideIds.sort().join(",")}`;
    onAddToTray({
      key,
      menuItem: dish,
      quantity,
      selectedModifiers: {
        portion: totals.portionLabel,
        spice: totals.spiceLabel,
        sides: totals.sideLabels,
      },
      unitPriceBdt: totals.unitPriceBdt,
      caloriesKcal: totals.caloriesKcal,
      proteinGrams: totals.proteinGrams,
      prepTimeMins: totals.prepTimeMins,
    });
    onClose();
  };

  const kcalPct = Math.min(100, (totals.caloriesKcal / 1100) * 100);
  const proteinPct = Math.min(100, (totals.proteinGrams / 85) * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      data-lenis-prevent
      onWheelCapture={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="w-full max-w-3xl bg-charcoal hairline-brass shadow-card overflow-hidden my-8"
      >
        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left Plate Visual & Live Macro Telemetry */}
          <div className="md:col-span-5 bg-obsidian p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-brass/20">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-syne text-[10px] uppercase tracking-[0.24em] text-brass">
                  {dish.category}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close customizer"
                  className="md:hidden p-1.5 border border-brass/25 text-sand hover:text-cream"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <motion.div
                whileHover={{ rotate: 12, scale: 1.05 }}
                transition={{ type: "spring", stiffness: 200, damping: 18 }}
                className="mx-auto my-6 w-48 h-48 rounded-full overflow-hidden bg-obsidian border border-brass/30 shadow-[0_24px_50px_rgba(0,0,0,0.9)] flex items-center justify-center"
              >
                <img
                  src={dish.image_url}
                  alt={dish.name}
                  className={getDishImageClass(dish.image_url, "mix-blend-lighten")}
                />
              </motion.div>

              <h3 className="font-display text-2xl sm:text-3xl text-cream leading-tight tracking-wide">
                {dish.name}
              </h3>
              <p className="mt-2.5 text-xs text-sand font-light leading-relaxed">
                {dish.description}
              </p>
            </div>

            {/* Live Macro & Prep Spring Bars */}
            <div className="mt-6 pt-5 border-t border-brass/20 space-y-3.5">
              <div>
                <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                  <span className="text-sand">ENERGY</span>
                  <span className="text-cream tabular-nums">{totals.caloriesKcal} kcal</span>
                </div>
                <div className="h-[3px] bg-charcoal overflow-hidden">
                  <motion.div
                    animate={{ width: `${kcalPct}%` }}
                    transition={{ type: "spring", stiffness: 210, damping: 24 }}
                    className="h-full bg-brass"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                  <span className="text-sand">PROTEIN</span>
                  <span className="text-cream tabular-nums">{totals.proteinGrams}g</span>
                </div>
                <div className="h-[3px] bg-charcoal overflow-hidden">
                  <motion.div
                    animate={{ width: `${proteinPct}%` }}
                    transition={{ type: "spring", stiffness: 210, damping: 24 }}
                    className="h-full bg-sage"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between font-mono text-[11px] text-sand pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brass" />
                  HEARTH FIRE PREP
                </span>
                <span className="text-cream tabular-nums">{totals.prepTimeMins} mins</span>
              </div>

              {/* Allergen Clarity */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {dish.is_dairy_free && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 border border-sage/40 text-sage">
                    <ShieldCheck className="w-3 h-3" />
                    DAIRY-FREE
                  </span>
                )}
                {dish.is_nut_free && (
                  <span className="font-mono text-[10px] px-2 py-0.5 border border-brass/20 text-sand">
                    NUT-FREE
                  </span>
                )}
                {dish.allergen_flags.map((flag) => (
                  <span
                    key={flag}
                    className="font-mono text-[10px] px-2 py-0.5 border border-ember/45 text-ember uppercase"
                  >
                    {flag.replace("_", " ")}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Configuration Panel */}
          <div className="md:col-span-7 p-6 sm:p-7 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="hidden md:flex items-center justify-between border-b border-brass/20 pb-3">
                <span className="font-syne text-xs uppercase tracking-[0.24em] text-brass">
                  Customize Spice &amp; Pairing
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close customizer"
                  className="p-1.5 border border-brass/25 text-sand hover:text-cream"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {portions.length > 0 && (
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.22em] text-sand mb-2.5">
                    Portion &amp; Cut
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {portions.map((opt) => {
                      const active = selectedPortionId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedPortionId(opt.id)}
                          className={`text-left px-4 py-3 border transition-colors ${
                            active
                              ? "bg-obsidian border-brass text-cream"
                              : "bg-obsidian/50 border-brass/20 text-sand hover:text-cream hover:border-brass/40"
                          }`}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="font-mono text-[11px] text-brass mt-0.5">
                            {opt.delta_bdt > 0 ? `+ ${formatBdt(opt.delta_bdt)}` : "Included"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {spiceLevels.length > 0 && (
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.22em] text-sand mb-2.5">
                    Heat &amp; Spice Calibration
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {spiceLevels.map((opt) => {
                      const active = selectedSpiceId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedSpiceId(opt.id)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 border text-xs transition-colors ${
                            active
                              ? "bg-brass text-obsidian border-brass font-medium"
                              : "bg-obsidian/60 border-brass/20 text-sand hover:text-cream"
                          }`}
                        >
                          {(opt.spice_value ?? 0) >= 2 && <Flame className="w-3 h-3" />}
                          <span>{opt.label}</span>
                          {opt.delta_bdt > 0 && (
                            <span className="font-mono text-[10px]">+{opt.delta_bdt}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {sides.length > 0 && (
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.22em] text-sand mb-2.5">
                    Chef Sides &amp; Dietary Modifiers
                  </label>
                  <div className="space-y-2">
                    {sides.map((opt) => {
                      const checked = selectedSideIds.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleSide(opt.id)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 border text-left transition-colors ${
                            checked
                              ? "bg-obsidian border-brass text-cream"
                              : "bg-obsidian/45 border-brass/20 text-sand hover:text-cream"
                          }`}
                        >
                          <span className="flex items-center gap-2.5 text-sm">
                            <span
                              className={`w-4 h-4 flex items-center justify-center border ${
                                checked
                                  ? "bg-brass border-brass text-obsidian"
                                  : "border-brass/40"
                              }`}
                            >
                              {checked && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                            {opt.label}
                          </span>
                          <span className="font-mono text-xs text-brass tabular-nums">
                            {opt.delta_bdt > 0
                              ? `+ ${formatBdt(opt.delta_bdt)}`
                              : "No Charge"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Qty + Add CTA */}
            <div className="mt-8 pt-5 border-t border-brass/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="inline-flex items-center border border-brass/30 bg-obsidian px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-7 h-7 text-sand hover:text-cream flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono text-sm text-cream tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    className="w-7 h-7 text-sand hover:text-cream flex items-center justify-center"
                  >
                    +
                  </button>
                </div>

                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-sand">
                    Item Subtotal
                  </div>
                  <div className="font-mono text-lg text-cream tabular-nums">
                    {formatBdt(totals.unitPriceBdt * quantity)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmAdd}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-brass bg-brass hover:bg-brass-soft text-obsidian font-syne text-xs uppercase tracking-[0.2em] font-bold transition-colors"
                data-cursor="RESERVE"
              >
                <Plus className="w-4 h-4" />
                <span>Add To Table Sequence</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
