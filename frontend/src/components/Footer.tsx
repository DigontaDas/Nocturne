"use client";

import Link from "next/link";
import { useReservationContext } from "@/context/ReservationContext";

export function Footer() {
  const { setConciergeOpen } = useReservationContext();

  return (
    <footer
      id="footer"
      data-scroll-section
      data-scroll-label="Footer"
      className="border-t border-brass/20 bg-obsidian py-16 px-5 sm:px-8"
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <img
              src="/web-app-manifest-192x192.png"
              alt="Nocturne emblem"
              className="w-8 h-8 rounded-full border border-brass/30 object-contain mix-blend-lighten"
            />
            <div className="font-display text-2xl tracking-[0.28em] text-cream uppercase">
              Nocturne
            </div>
          </div>
          <p className="mt-3 text-sm text-sand/85 max-w-sm leading-relaxed font-light">
            Banani Road 11, Level 14 Penthouse, Dhaka 1213. 100% Zabiha Halal oak-hearth
            dining &amp; zero-proof botanical mixology overlooking Banani Lake.
          </p>
        </div>

        <div className="md:col-span-4 space-y-2 text-sm">
          <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-brass mb-3">
            Evening Service Hours
          </div>
          <p className="font-sans text-xs text-cream/90 tabular-nums">
            19:00 Sunset &middot; 20:30 Prime &middot; 22:00 Late Night
          </p>
          <p className="font-sans text-xs text-sand/80 font-light">
            Smart Evening Attire &middot; Retractable Monsoon Pergola
          </p>
        </div>

        <div className="md:col-span-3 flex flex-col items-start md:items-end gap-3.5">
          <button
            type="button"
            onClick={() => setConciergeOpen(true)}
            className="inline-flex items-center px-5 py-2.5 border border-brass/35 bg-charcoal hover:border-brass font-sans text-xs font-medium uppercase tracking-[0.16em] text-cream transition-colors"
            data-cursor="RESERVE"
          >
            <span>Maître d&apos; &amp; Sommelier</span>
          </button>
          <Link
            href="/booking/NOC-2026-9941"
            className="inline-flex items-center font-sans text-xs uppercase tracking-[0.14em] text-sand hover:text-brass transition-colors"
          >
            <span>Sample Reservation Pass</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
