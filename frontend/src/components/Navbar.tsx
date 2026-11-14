"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useReservationContext } from "@/context/ReservationContext";

const NAV_LINKS = [
  { href: "/", label: "Editorial", match: (p: string) => p === "/" },
  {
    href: "/reserve",
    label: "Floorplan",
    match: (p: string) => p.startsWith("/reserve"),
  },
  {
    href: "/menu",
    label: "Tasting Wheel",
    match: (p: string) => p.startsWith("/menu"),
  },
] as const;

function CelestialAstrolabeLogo({ scrollY }: { scrollY: number }) {
  const outerRot = (scrollY * 0.14) % 360;
  const innerRot = (-scrollY * 0.22) % 360;

  return (
    <svg
      viewBox="0 0 44 44"
      className="w-9 h-9 shrink-0 overflow-visible"
      aria-hidden="true"
    >
      {/* Outer Ticked Astrolabe Ring */}
      <g transform={`rotate(${outerRot} 22 22)`}>
        <circle
          cx="22"
          cy="22"
          r="19"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="0.9"
          strokeDasharray="2.5 3.5"
          strokeOpacity="0.85"
        />
        <circle
          cx="22"
          cy="3"
          r="1.4"
          fill="#D4AF37"
        />
        <circle
          cx="22"
          cy="41"
          r="1"
          fill="#D4AF37"
          fillOpacity="0.7"
        />
      </g>

      {/* Inner Counter-Rotating Eclipse Crescent */}
      <g transform={`rotate(${innerRot} 22 22)`}>
        <circle
          cx="22"
          cy="22"
          r="13.5"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="0.75"
          strokeOpacity="0.55"
        />
        <path
          d="M 22 9.5 A 12.5 12.5 0 1 1 11.2 28.2 A 9.6 9.6 0 1 0 22 9.5 Z"
          fill="#D4AF37"
          fillOpacity="0.88"
        />
      </g>

      {/* 4-Point Brass Celestial Star Core */}
      <path
        d="M22 16.5 L23.3 20.7 L27.5 22 L23.3 23.3 L22 27.5 L20.7 23.3 L16.5 22 L20.7 20.7 Z"
        fill="#FAF7F2"
      />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { setConciergeOpen, trayItems, heldTable } = useReservationContext();
  const [scrollY, setScrollY] = useState(0);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const totalCount = trayItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrolled = scrollY > 36;

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-colors duration-500 ${
        scrolled
          ? "bg-obsidian/88 backdrop-blur-xl border-b border-brass/20"
          : "bg-gradient-to-b from-obsidian/90 via-obsidian/45 to-transparent border-b border-brass/10"
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between gap-6">
        {/* Bespoke Celestial Astrolabe Emblem + Cinzel Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-3.5 group"
          data-cursor="RESERVE"
        >
          <CelestialAstrolabeLogo scrollY={scrollY} />
          <div className="flex flex-col">
            <span className="font-display text-lg sm:text-xl tracking-[0.28em] text-cream uppercase leading-none font-semibold group-hover:text-brass transition-colors">
              Nocturne
            </span>
            <span className="font-mono text-[9px] tracking-[0.26em] text-sand/75 uppercase mt-1">
              Banani • Level 14
            </span>
          </div>
        </Link>

        {/* Frameless Syne Navigation with Sliding 1px Brass Underline */}
        <nav
          onMouseLeave={() => setHoveredHref(null)}
          className="hidden md:flex items-center gap-9"
        >
          {NAV_LINKS.map((item) => {
            const isActive = item.match(pathname);
            const showLine = hoveredHref ? hoveredHref === item.href : isActive;
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHoveredHref(item.href)}
                className={`relative py-2 font-syne text-xs uppercase tracking-[0.22em] transition-colors flex items-center gap-2 ${
                  isActive || hoveredHref === item.href
                    ? "text-cream"
                    : "text-sand hover:text-cream"
                }`}
              >
                <span>{item.label}</span>
                {item.href === "/menu" && totalCount > 0 && (
                  <span className="font-mono text-[10px] text-brass tabular-nums">
                    [{totalCount}]
                  </span>
                )}
                {showLine && (
                  <motion.span
                    layoutId="nav-brass-underline"
                    transition={{ type: "spring", stiffness: 360, damping: 30 }}
                    className="absolute left-0 right-0 bottom-0 h-[1px] bg-brass"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Architectural Hairline Actions (Zero Glowing Pills) */}
        <div className="flex items-center gap-4">
          {heldTable && (
            <Link
              href="/reserve"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 border border-ember/50 bg-obsidian/70 text-ember font-mono text-[11px] tracking-wider uppercase tabular-nums"
            >
              <span className="w-1.5 h-1.5 bg-ember animate-pulse" />
              {heldTable.tableCode} HELD
            </Link>
          )}

          <button
            type="button"
            onClick={() => setConciergeOpen((prev) => !prev)}
            className="group inline-flex items-center gap-2.5 px-4 py-2 border border-brass/35 hover:border-brass bg-obsidian/65 text-cream font-syne text-[11px] uppercase tracking-[0.2em] transition-colors"
            data-cursor="RESERVE"
          >
            <span className="w-1.5 h-1.5 bg-brass" />
            <span>Concierge</span>
            <span className="font-mono text-[10px] text-brass/90">⌘J</span>
          </button>
        </div>
      </div>
    </header>
  );
}
