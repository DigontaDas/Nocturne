"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useReservationContext } from "@/context/ReservationContext";

export function Footer() {
  const { setConciergeOpen } = useReservationContext();

  return (
    <footer className="border-t border-brass/20 bg-obsidian py-16 px-5 sm:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
        <div className="md:col-span-5">
          <div className="font-display text-2xl tracking-[0.28em] text-cream uppercase">
            Nocturne
          </div>
          <p className="mt-3 text-sm text-sand/85 max-w-sm leading-relaxed font-light">
            Banani Road 11, Level 14 Penthouse, Dhaka 1213. 100% Zabiha Halal oak-hearth
            dining &amp; zero-proof botanical mixology overlooking Banani Lake.
          </p>
        </div>

        <div className="md:col-span-4 space-y-2 text-sm">
          <div className="font-syne text-[11px] uppercase tracking-[0.24em] text-brass mb-3">
            Seating Telemetry
          </div>
          <p className="font-mono text-xs text-cream/90 tabular-nums">
            19:00 Sunset · 20:30 Prime · 22:00 Late Night
          </p>
          <p className="text-xs text-sand/80">
            Smart Evening Attire · Retractable Monsoon Pergola
          </p>
        </div>

        <div className="md:col-span-3 flex flex-col items-start md:items-end gap-3.5">
          <button
            type="button"
            onClick={() => setConciergeOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-brass/35 bg-charcoal hover:border-brass font-syne text-xs uppercase tracking-[0.18em] text-cream transition-colors"
            data-cursor="RESERVE"
          >
            <span>Open AI Concierge</span>
            <span className="font-mono text-brass">[⌘J]</span>
          </button>
          <Link
            href="/booking/NOC-2026-9941"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-sand hover:text-brass transition-colors"
          >
            <span>Inspect Sample Boarding Pass</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
