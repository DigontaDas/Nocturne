"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchMenuItems } from "@/lib/api";
import { FALLBACK_MENU_ITEMS } from "@/lib/fallback-data";
import { useReservationContext } from "@/context/ReservationContext";
import { MenuCustomizerSection } from "@/components/MenuCustomizerSection";

function MenuPageContent() {
  const searchParams = useSearchParams();
  const { setConciergeOpen } = useReservationContext();

  const { data: menuItems } = useQuery({
    queryKey: ["menu-page-items"],
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

  return (
    <div className="min-h-screen bg-obsidian pt-24 pb-20 px-4 sm:px-8 max-w-[1440px] mx-auto">
      {/* Architectural Header */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-brass/20 pb-8">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-brass">
            Seasonal Tasting Menu &bull; 12 Wood-Fired Plates
          </span>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl lg:text-6xl uppercase tracking-[0.06em] text-cream leading-[1.02]">
            The Nocturne{" "}
            <span className="font-serif italic font-normal normal-case tracking-normal text-brass">
              Tasting Wheel
            </span>
          </h1>
          <p className="mt-3 max-w-2xl font-sans text-sm sm:text-base font-light text-sand/85 leading-relaxed">
            Dial the clockwise brass bezel or flick any porcelain plate to inspect calories,
            protein grams, spice adjustments, and strict halal allergen separation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setConciergeOpen(true)}
            className="inline-flex items-center px-5 py-3 border border-brass/35 bg-charcoal hover:border-brass text-cream font-sans text-xs font-medium uppercase tracking-[0.16em] transition-colors"
          >
            <span>Ask Sommelier</span>
          </button>

          <Link
            href="/reserve"
            data-cursor="RESERVE"
            className="inline-flex items-center px-5 py-3 bg-brass hover:bg-brass-soft text-obsidian font-sans text-xs font-semibold uppercase tracking-[0.18em] transition-colors"
          >
            <span>Floorplan &amp; Seat Selection</span>
          </Link>
        </div>
      </div>

      <MenuCustomizerSection
        menuItems={menuItems}
        initialDishSlug={searchParams.get("dish") || undefined}
        standalone
      />
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-obsidian pt-32 px-8 text-center font-mono text-sm text-brass">
          Calibrating Tasting Wheel...
        </div>
      }
    >
      <MenuPageContent />
    </Suspense>
  );
}
