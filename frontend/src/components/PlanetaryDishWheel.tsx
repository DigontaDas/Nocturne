"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Check, Flame, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { formatBdt } from "@/lib/api";
import { getDishImageClass } from "@/lib/dish-media";
import { useReservationContext } from "@/context/ReservationContext";
import { DishCustomizerModal } from "@/components/DishCustomizerModal";
import { TastingWheelWings } from "@/components/TastingWheelWings";
import {
  createDefaultTrayItem,
  getPairedDish,
  resolveCuratedFlights,
} from "@/lib/tasting-logic";
import { MenuItem } from "@/types/nocturne";

gsap.registerPlugin(ScrollTrigger);

const WHEEL_CATEGORIES = [
  "All",
  "Wood-Fired Steaks",
  "Small Plates",
  "Artisanal Pasta",
  "Botanical Mocktails",
  "Desserts",
] as const;

const WHEEL_RADIUS = 750; // 1500px wheel diameter / 2
const STEP_ANGLE = 32; // deg between adjacent plates on the bottom arch

interface ArchPlateProps {
  dish: MenuItem;
  index: number;
  count: number;
  hydrated: boolean;
  smoothCursor: MotionValue<number>;
  onSelect: () => void;
}

function getWrappedOffset(index: number, cursor: number, count: number): number {
  if (count <= 1) return 0;
  const raw = index - cursor;
  return raw - Math.round(raw / count) * count;
}

function getPlateMetrics(offset: number) {
  const rad = ((-90 + offset * STEP_ANGLE) * Math.PI) / 180;
  const x = WHEEL_RADIUS + Math.cos(rad) * WHEEL_RADIUS;
  const y = WHEEL_RADIUS + Math.sin(rad) * WHEEL_RADIUS;
  const abs = Math.abs(offset);
  const size = abs >= 1 ? 290 : 340 - abs * (340 - 290);
  const absClamped = Math.min(2, abs);
  const scale =
    absClamped <= 1
      ? 1.08 - absClamped * (1.08 - 0.92)
      : 0.92 - (absClamped - 1) * (0.92 - 0.78);
  const opacity =
    abs <= 1
      ? 1 - abs * (1 - 0.85)
      : abs < 1.85
        ? 0.85 * (1 - (abs - 1) / 0.85)
        : 0;
  const zIndex = abs < 0.45 ? 30 : abs < 1.45 ? 20 : 5;
  const pointerEvents: "auto" | "none" = abs < 1.45 ? "auto" : "none";
  return { x, y, size, scale, opacity, zIndex, pointerEvents };
}

function ArchWheelPlate({
  dish,
  index,
  count,
  hydrated,
  smoothCursor,
  onSelect,
}: ArchPlateProps) {
  // Continuous wrapped offset relative to current smoothCursor so plates sweep along a true circular arc
  const wrappedOffset = useTransform(smoothCursor, (cursor) =>
    getWrappedOffset(index, cursor, count)
  );

  // Polar angle in degrees along the hidden-center bottom arch (-90deg = 12 o'clock apex)
  const xPx = useTransform(wrappedOffset, (offset) => getPlateMetrics(offset).x);
  const yPx = useTransform(wrappedOffset, (offset) => getPlateMetrics(offset).y);
  const plateSizePx = useTransform(
    wrappedOffset,
    (offset) => getPlateMetrics(offset).size
  );
  const plateScale = useTransform(
    wrappedOffset,
    (offset) => getPlateMetrics(offset).scale
  );
  const plateOpacity = useTransform(
    wrappedOffset,
    (offset) => getPlateMetrics(offset).opacity
  );
  const plateZIndex = useTransform(
    wrappedOffset,
    (offset) => getPlateMetrics(offset).zIndex
  );
  const platePointerEvents = useTransform(
    wrappedOffset,
    (offset) => getPlateMetrics(offset).pointerEvents
  );

  // Keep the active 12 o'clock plate upright (0deg) while flanking plates tilt gently along the arch
  const plateSelfRotate = useTransform(wrappedOffset, (offset) => offset * 28);

  // Deterministic integer-rounded metrics during SSR & initial hydration pass prevent React float mismatches
  const initialOffset = getWrappedOffset(index, 0, count);
  const initial = getPlateMetrics(initialOffset);
  const initialRotateDeg = Math.round(initialOffset * 28);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      style={
        hydrated
          ? {
              left: xPx,
              top: yPx,
              width: plateSizePx,
              height: plateSizePx,
              x: "-50%",
              y: "-50%",
              scale: plateScale,
              opacity: plateOpacity,
              zIndex: plateZIndex,
              pointerEvents: platePointerEvents,
            }
          : {
              left: Math.round(initial.x),
              top: Math.round(initial.y),
              width: Math.round(initial.size),
              height: Math.round(initial.size),
              transform: `translate(-50%, -50%) scale(${Number(initial.scale.toFixed(2))})`,
              opacity: Number(initial.opacity.toFixed(2)),
              zIndex: initial.zIndex,
              pointerEvents: initial.pointerEvents,
            }
      }
      data-cursor="SPIN"
      aria-label={`Select ${dish.name}`}
      className="absolute rounded-full focus:outline-none group"
    >
      <motion.div
        style={
          hydrated
            ? { rotate: plateSelfRotate }
            : { transform: `rotate(${initialRotateDeg}deg)` }
        }
        className="w-full h-full rounded-full overflow-hidden bg-obsidian border border-brass/35 shadow-[0_32px_70px_rgba(0,0,0,0.92)] flex items-center justify-center group-hover:border-brass transition-colors"
      >
        <img
          src={dish.image_url}
          alt={dish.name}
          draggable={false}
          className={getDishImageClass(
            dish.image_url,
            "mix-blend-lighten pointer-events-none select-none"
          )}
        />
      </motion.div>
    </motion.button>
  );
}

interface PlanetaryDishWheelProps {
  dishes: MenuItem[];
  fullCatalog?: MenuItem[];
  mode?: "pinned" | "interactive";
  initialDishSlug?: string;
  sectionLabel?: string;
  titlePrefix?: string;
  titleItalic?: string;
  sectionId?: string;
  scrollLabel?: string;
}

export function PlanetaryDishWheel({
  dishes,
  fullCatalog,
  mode = "interactive",
  initialDishSlug,
  sectionLabel = "Signature Tasting Sequence",
  titlePrefix = "Tasting",
  titleItalic = "Arch",
  sectionId,
  scrollLabel,
}: PlanetaryDishWheelProps) {
  const { addTrayItem, trayItems } = useReservationContext();

  const [activeCategory, setActiveCategory] = useState<string>("All");
  const filteredDishes =
    activeCategory === "All"
      ? dishes
      : dishes.filter((d) => d.category === activeCategory);
  const safeDishes = filteredDishes.length > 0 ? filteredDishes : dishes;
  const count = Math.max(1, safeDishes.length);

  const pinSectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollStepsRef = useRef<number>(0);
  const manualOffsetRef = useRef<number>(0);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    lastX: number;
    startCursor: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    lastX: 0,
    startCursor: 0,
    moved: false,
  });

  // Continuous unwrapped cursor driving all polar arch motion + self-spin
  const targetCursor = useMotionValue(0);
  const smoothCursor = useSpring(targetCursor, {
    stiffness: 110,
    damping: 18,
    mass: 1,
  });

  const [hydrated, setHydrated] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [customizerDish, setCustomizerDish] = useState<MenuItem | null>(null);
  const [addedSlug, setAddedSlug] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const syncActiveIndex = (cursorVal: number, totalCount: number) => {
    if (totalCount <= 0) return;
    const rounded = Math.round(cursorVal);
    const wrapped = ((rounded % totalCount) + totalCount) % totalCount;
    setActiveIndex(wrapped);
  };

  // Honor optional ?dish=... slug
  useEffect(() => {
    if (!initialDishSlug || safeDishes.length === 0) return;
    const idx = safeDishes.findIndex((d) => d.slug === initialDishSlug);
    if (idx >= 0) {
      manualOffsetRef.current = idx - scrollStepsRef.current;
      const next = scrollStepsRef.current + manualOffsetRef.current;
      targetCursor.set(next);
      setActiveIndex(idx);
    } else if (activeCategory !== "All" && dishes.some((d) => d.slug === initialDishSlug)) {
      setActiveCategory("All");
    }
  }, [initialDishSlug, activeCategory, dishes, safeDishes, targetCursor]);

  // GSAP ScrollTrigger pinning when mode="pinned" on desktop (>= 1024px) only
  useGSAP(
    () => {
      if (mode !== "pinned" || !pinSectionRef.current || safeDishes.length <= 1) {
        return;
      }

      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        const maxScrollSteps = Math.min(6, Math.max(1, safeDishes.length - 1));
        const st = ScrollTrigger.create({
          trigger: pinSectionRef.current,
          start: "top top",
          end: () => `+=${maxScrollSteps * 260}`,
          pin: true,
          scrub: 1.1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (dragRef.current.active) return;
            const stepFloat = self.progress * maxScrollSteps;
            scrollStepsRef.current = stepFloat;
            const total = stepFloat + manualOffsetRef.current;
            targetCursor.set(total);
            syncActiveIndex(total, count);
          },
        });

        return () => {
          st.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: pinSectionRef, dependencies: [mode, count] }
  );

  const stepBy = (delta: number) => {
    if (count <= 1) return;
    const snapped = Math.round(targetCursor.get()) + delta;
    manualOffsetRef.current = snapped - scrollStepsRef.current;
    targetCursor.set(snapped);
    syncActiveIndex(snapped, count);
  };

  const selectPlateAtIndex = (clickedIndex: number) => {
    if (count <= 1 || dragRef.current.moved) return;
    const current = Math.round(targetCursor.get());
    const wrappedCurrent = ((current % count) + count) % count;
    let delta = clickedIndex - wrappedCurrent;
    if (delta > count / 2) delta -= count;
    if (delta < -count / 2) delta += count;
    if (delta === 0) {
      setCustomizerDish(safeDishes[clickedIndex] ?? null);
      return;
    }
    stepBy(delta);
  };

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    const nextList =
      category === "All"
        ? dishes
        : dishes.filter((d) => d.category === category);
    const nextCount = Math.max(1, nextList.length);
    // Reset smoothly to first dish in chosen category while adding a crisp +2-step spin feel
    const currentRounded = Math.round(targetCursor.get());
    const spinBase = currentRounded + 2 - ((currentRounded + 2) % nextCount);
    manualOffsetRef.current = spinBase - scrollStepsRef.current;
    targetCursor.set(spinBase);
    setActiveIndex(0);
  };

  // Horizontal Drag / Swipe Physics across the Bottom Arch
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      lastX: e.clientX,
      startCursor: targetCursor.get(),
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const totalDx = e.clientX - dragRef.current.startX;
    if (Math.abs(totalDx) > 8) {
      dragRef.current.moved = true;
    }
    // Dragging left (negative dx) moves next plate (positive cursor) into 12 o'clock center
    const nextCursor = dragRef.current.startCursor - totalDx / 220;
    targetCursor.set(nextCursor);
    syncActiveIndex(nextCursor, count);
    dragRef.current.lastX = e.clientX;
  };

  const handlePointerUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const snapped = Math.round(targetCursor.get());
    manualOffsetRef.current = snapped - scrollStepsRef.current;
    targetCursor.set(snapped);
    syncActiveIndex(snapped, count);
    window.setTimeout(() => {
      dragRef.current.moved = false;
    }, 60);
  };

  const activeDish = safeDishes[activeIndex % safeDishes.length] ?? safeDishes[0];
  const basePrice = activeDish ? Number(activeDish.base_price_bdt) : 0;
  const trayCount = trayItems.reduce((sum, item) => sum + item.quantity, 0);
  const catalogForLogic =
    fullCatalog && fullCatalog.length > 0 ? fullCatalog : dishes;
  const activePairing = activeDish
    ? getPairedDish(activeDish, catalogForLogic)
    : null;
  const curatedFlights = resolveCuratedFlights(catalogForLogic);

  const jumpToDishSlug = (slug: string) => {
    let targetIdx = safeDishes.findIndex((d) => d.slug === slug);
    if (targetIdx < 0) {
      setActiveCategory("All");
      targetIdx = dishes.findIndex((d) => d.slug === slug);
      if (targetIdx < 0) return;
      const totalCount = Math.max(1, dishes.length);
      const currentRounded = Math.round(targetCursor.get());
      const spinBase =
        targetIdx + Math.round((currentRounded - targetIdx) / totalCount) * totalCount;
      manualOffsetRef.current = spinBase - scrollStepsRef.current;
      targetCursor.set(spinBase);
      setActiveIndex(targetIdx);
      return;
    }
    selectPlateAtIndex(targetIdx);
  };

  const handleQuickAdd = (dish: MenuItem) => {
    addTrayItem(createDefaultTrayItem(dish));

    setAddedSlug(dish.slug);
    window.setTimeout(() => {
      setAddedSlug((prev) => (prev === dish.slug ? null : prev));
    }, 1800);
  };

  const prevDish =
    safeDishes[(activeIndex - 1 + safeDishes.length) % safeDishes.length] ?? activeDish;
  const nextDish =
    safeDishes[(activeIndex + 1) % safeDishes.length] ?? activeDish;

  if (!activeDish) return null;

  return (
    <section
      id={sectionId}
      data-scroll-section={scrollLabel ? "" : undefined}
      data-scroll-label={scrollLabel}
      ref={pinSectionRef}
      className="relative w-full min-h-[700px] md:min-h-[880px] lg:h-[880px] overflow-hidden flex flex-col items-center justify-start pt-10 md:pt-12 pb-12 lg:pb-0 bg-obsidian text-cream border-t border-brass/15 select-none"
    >
      {/* Subtle Radial Warm Glow Behind the 12 O'Clock Plate Apex */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[180px] md:top-[210px] left-1/2 -translate-x-1/2 w-[340px] sm:w-[520px] h-[340px] sm:h-[520px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.09)_0%,rgba(14,13,12,0)_70%)]"
      />

      {/* TOP HALF OF STAGE: Centered Header, Category Tabs, and Primary Actions Above Active Plate */}
      <header className="relative z-40 w-full max-w-5xl px-4 flex flex-col items-center text-center">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.24em] sm:tracking-[0.28em] text-brass">
          <span>{sectionLabel}</span>
          <span className="text-brass/40">/</span>
          <span className="tabular-nums text-cream/85">
            {String((activeIndex % count) + 1).padStart(2, "0")} OF{" "}
            {String(count).padStart(2, "0")}
          </span>
          {trayCount > 0 && (
            <>
              <span className="text-brass/40">/</span>
              <span className="text-sage tabular-nums">{trayCount} IN TRAY</span>
            </>
          )}
        </div>

        <h2 className="sr-only">
          {titlePrefix} {titleItalic}
        </h2>

        {/* Scrollable on phones, wrapped cleanly on tablet/desktop */}
        <div
          role="tablist"
          aria-label="Menu Categories"
          className="mt-4 w-full max-w-full overflow-x-auto no-scrollbar flex items-center justify-start sm:justify-center sm:flex-wrap gap-x-5 gap-y-2 border-b border-brass/20 pb-2.5 px-1"
        >
          {WHEEL_CATEGORIES.map((category) => {
            const isSelected = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleCategoryChange(category)}
                className={`relative pb-1 whitespace-nowrap font-syne text-[10px] sm:text-[11px] uppercase tracking-[0.2em] transition-colors shrink-0 ${
                  isSelected
                    ? "text-brass font-bold"
                    : "text-sand/70 hover:text-cream"
                }`}
              >
                {category}
                {isSelected && (
                  <motion.span
                    layoutId="arch-category-underline"
                    className="absolute left-0 right-0 -bottom-[11px] h-[1px] bg-brass"
                    transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Centered Quick Actions & Safety Badges Directly Above the 12 O'Clock Plate */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => handleQuickAdd(activeDish)}
            data-cursor="RESERVE"
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-brass hover:bg-brass-soft text-obsidian font-syne text-[10px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.2em] transition-colors"
          >
            {addedSlug === activeDish.slug ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added to Sequence</span>
              </>
            ) : (
              <span>+ Add to Sequence</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCustomizerDish(activeDish)}
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 border border-brass/40 hover:border-brass bg-obsidian/80 text-cream font-syne text-[10px] uppercase tracking-[0.18em] sm:tracking-[0.2em] transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-brass" />
            <span>Customize Dish</span>
          </button>

          {activeDish.is_dairy_free && (
            <span className="hidden sm:inline-flex items-center gap-1 px-3 py-2 border border-sage/40 bg-sage/10 text-sage font-mono text-[10px] uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" />
              Dairy-Free Line
            </span>
          )}
        </div>
      </header>

      {/* MOBILE CURVED SHOWCASE (< 768px) — zero clipping, responsive flanking plates */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="md:hidden relative w-full mt-8 px-4 flex flex-col items-center touch-pan-y"
      >
        <div className="relative w-full max-w-[360px] h-[240px] flex items-center justify-center overflow-hidden">
          {safeDishes.length > 1 && (
            <button
              type="button"
              onClick={() => stepBy(-1)}
              aria-label={`Select previous: ${prevDish.name}`}
              className="absolute -left-10 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full overflow-hidden bg-obsidian border border-brass/25 opacity-45 hover:opacity-80 transition-opacity"
            >
              <img
                src={prevDish.image_url}
                alt={prevDish.name}
                className={getDishImageClass(prevDish.image_url, "mix-blend-lighten")}
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => setCustomizerDish(activeDish)}
            aria-label={`Customize ${activeDish.name}`}
            className="relative z-20 w-52 h-52 sm:w-56 sm:h-56 rounded-full overflow-hidden bg-obsidian border border-brass/50 shadow-[0_24px_60px_rgba(0,0,0,0.92)]"
          >
            <img
              src={activeDish.image_url}
              alt={activeDish.name}
              className={getDishImageClass(activeDish.image_url, "mix-blend-lighten")}
            />
          </button>

          {safeDishes.length > 1 && (
            <button
              type="button"
              onClick={() => stepBy(1)}
              aria-label={`Select next: ${nextDish.name}`}
              className="absolute -right-10 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full overflow-hidden bg-obsidian border border-brass/25 opacity-45 hover:opacity-80 transition-opacity"
            >
              <img
                src={nextDish.image_url}
                alt={nextDish.name}
                className={getDishImageClass(nextDish.image_url, "mix-blend-lighten")}
              />
            </button>
          )}
        </div>

        {/* Sleek Prev / Next Touch Controls for Mobile */}
        <div className="mt-4 flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={() => stepBy(-1)}
            aria-label="Previous dish"
            className="p-2 border border-brass/30 text-brass hover:border-brass transition-colors"
          >
            <svg viewBox="0 0 44 16" className="w-8 h-3.5" aria-hidden="true">
              <line x1="42" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.25" />
              <polyline points="9,2 2,8 9,14" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-sand">
            Swipe or Tap Plate
          </span>
          <button
            type="button"
            onClick={() => stepBy(1)}
            aria-label="Next dish"
            className="p-2 border border-brass/30 text-brass hover:border-brass transition-colors"
          >
            <svg viewBox="0 0 44 16" className="w-8 h-3.5" aria-hidden="true">
              <line x1="2" y1="8" x2="41" y2="8" stroke="currentColor" strokeWidth="1.25" />
              <polyline points="35,2 42,8 35,14" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </button>
        </div>

        {/* Mobile Dish Details */}
        <div className="mt-5 w-full max-w-sm text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 font-syne text-[10px] uppercase tracking-[0.24em] text-brass border border-brass/30 bg-obsidian px-3 py-1">
            <span>{activeDish.category}</span>
            {activeDish.spice_level > 0 && (
              <span className="inline-flex items-center gap-1 text-ember">
                <Flame className="w-3 h-3" />
                {activeDish.spice_level === 3 ? "NAGA" : `L${activeDish.spice_level}`}
              </span>
            )}
          </div>
          <h3 className="font-display text-2xl uppercase tracking-[0.06em] text-cream leading-tight">
            {activeDish.name}
          </h3>
          <div className="font-mono text-xs tabular-nums text-sand flex flex-wrap justify-center gap-x-3 gap-y-1">
            <span className="text-brass font-medium">{formatBdt(basePrice)}</span>
            <span>&bull;</span>
            <span>
              {activeDish.calories_kcal} kcal &bull; {activeDish.protein_grams}g P &bull;{" "}
              {activeDish.prep_time_mins}m
            </span>
          </div>
          <p className="font-sans text-xs text-sand/85 font-light leading-relaxed pt-1">
            {activeDish.description}
          </p>
        </div>
      </div>

      {/* DESKTOP / TABLET SLEEK HORIZONTAL LONG ARROW CONTROLS (md+) */}
      <button
        type="button"
        onClick={() => stepBy(-1)}
        data-cursor="SPIN"
        aria-label="Previous dish"
        className="hidden md:flex group absolute top-[395px] -translate-y-1/2 md:left-[6%] lg:left-[12%] z-40 items-center gap-2 py-3 px-2 text-brass/80 hover:text-brass transition-colors focus:outline-none"
      >
        <svg
          viewBox="0 0 88 20"
          className="w-14 lg:w-20 h-5 overflow-visible transition-transform duration-300 group-hover:-translate-x-1.5"
          aria-hidden="true"
        >
          <line x1="86" y1="10" x2="4" y2="10" stroke="currentColor" strokeWidth="1.25" />
          <polyline points="12,3 3,10 12,17" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
        <span className="sr-only">Previous</span>
      </button>

      <button
        type="button"
        onClick={() => stepBy(1)}
        data-cursor="SPIN"
        aria-label="Next dish"
        className="hidden md:flex group absolute top-[395px] -translate-y-1/2 md:right-[6%] lg:right-[12%] z-40 items-center gap-2 py-3 px-2 text-brass/80 hover:text-brass transition-colors focus:outline-none"
      >
        <svg
          viewBox="0 0 88 20"
          className="w-14 lg:w-20 h-5 overflow-visible transition-transform duration-300 group-hover:translate-x-1.5"
          aria-hidden="true"
        >
          <line x1="2" y1="10" x2="84" y2="10" stroke="currentColor" strokeWidth="1.25" />
          <polyline points="76,3 85,10 76,17" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
        <span className="sr-only">Next</span>
      </button>

      {/* DESKTOP / TABLET BOTTOM HALF OF STAGE: GIANT SUB-HORIZON WHEEL (md+) */}
      <div
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        data-cursor="DRAG"
        className="hidden md:block pointer-events-auto absolute left-1/2 -translate-x-1/2 top-[400px] w-[1500px] h-[1500px] md:scale-[0.76] lg:scale-[0.9] xl:scale-100 origin-top cursor-grab active:cursor-grabbing"
      >
        {safeDishes.map((dish, idx) => (
          <ArchWheelPlate
            key={`${activeCategory}-${dish.slug}`}
            dish={dish}
            index={idx}
            count={count}
            hydrated={hydrated}
            smoothCursor={smoothCursor}
            onSelect={() => selectPlateAtIndex(idx)}
          />
        ))}
      </div>

      {/* DESKTOP / TABLET CENTERED ANIMATED DISH READOUT BELOW THE 12 O'CLOCK PLATE */}
      <div className="hidden md:flex pointer-events-none absolute top-[612px] inset-x-0 z-40 justify-center px-4">
        <div className="w-full max-w-md text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeCategory}-${activeDish.slug}`}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-2"
            >
              <div className="inline-flex items-center justify-center gap-2 font-syne text-[10px] uppercase tracking-[0.28em] text-brass border border-brass/30 bg-obsidian/85 px-3 py-1">
                <span>{activeDish.category}</span>
                {activeDish.spice_level > 0 && (
                  <span className="inline-flex items-center gap-1 text-ember">
                    <Flame className="w-3 h-3" />
                    {activeDish.spice_level === 3
                      ? "NAGA"
                      : `L${activeDish.spice_level}`}
                  </span>
                )}
              </div>

              <h3 className="font-display text-2xl sm:text-4xl uppercase tracking-[0.06em] text-cream leading-[1.06]">
                {activeDish.name}
              </h3>

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-xs sm:text-sm tabular-nums pt-0.5">
                <span className="text-brass font-medium">
                  {formatBdt(basePrice)}
                </span>
                <span className="text-brass/35">&bull;</span>
                <span className="text-sand">
                  {activeDish.calories_kcal} kcal &bull; {activeDish.protein_grams}g
                  Protein &bull; {activeDish.prep_time_mins}m
                </span>
              </div>

              <p className="font-sans text-xs text-sand/80 font-light leading-relaxed line-clamp-2 pt-1 max-w-sm mx-auto">
                {activeDish.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Flanking Culinary Telemetry, Dynamic Pairing & Curated Flight Composer */}
      <TastingWheelWings
        activeDish={activeDish}
        pairing={activePairing}
        flights={curatedFlights}
        mode={mode}
        onJumpToDishSlug={jumpToDishSlug}
      />

      {/* Shared-Layout Dish Customizer Modal */}
      <AnimatePresence>
        {customizerDish && (
          <DishCustomizerModal
            dish={customizerDish}
            onClose={() => setCustomizerDish(null)}
            onAddToTray={addTrayItem}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
