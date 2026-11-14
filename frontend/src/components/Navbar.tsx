"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Lock, Menu, Sparkles, X } from "lucide-react";
import { useReservationContext } from "@/context/ReservationContext";

const NAV_LINKS = [
  {
    index: "01",
    href: "/",
    label: "Editorial",
    subtitle: "Horizon & Manifesto",
    match: (p: string) => p === "/",
  },
  {
    index: "02",
    href: "/reserve",
    label: "Floorplan",
    subtitle: "2D Acoustic Sightlines",
    match: (p: string) => p.startsWith("/reserve"),
  },
  {
    index: "03",
    href: "/menu",
    label: "Tasting",
    subtitle: "Clockwise Tasting Arch",
    match: (p: string) => p.startsWith("/menu"),
  },
] as const;

function CelestialAstrolabeLogo({ scrollY }: { scrollY: number }) {
  const outerRot = (scrollY * 0.14) % 360;
  const innerRot = (-scrollY * 0.22) % 360;

  return (
    <svg
      viewBox="0 0 44 44"
      className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <g transform={`rotate(${outerRot} 22 22)`}>
        <circle
          cx="22"
          cy="22"
          r="19"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="0.85"
          strokeDasharray="2.5 3.5"
          strokeOpacity="0.85"
        />
        <circle cx="22" cy="3" r="1.4" fill="#D4AF37" />
        <circle cx="22" cy="41" r="1" fill="#D4AF37" fillOpacity="0.65" />
      </g>

      <g transform={`rotate(${innerRot} 22 22)`}>
        <circle
          cx="22"
          cy="22"
          r="13.5"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="0.7"
          strokeOpacity="0.5"
        />
        <path
          d="M 22 9.5 A 12.5 12.5 0 1 1 11.2 28.2 A 9.6 9.6 0 1 0 22 9.5 Z"
          fill="#D4AF37"
          fillOpacity="0.88"
        />
      </g>

      <path
        d="M22 16.5 L23.3 20.7 L27.5 22 L23.3 23.3 L22 27.5 L20.7 23.3 L16.5 22 L20.7 20.7 Z"
        fill="#FAF7F2"
      />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const {
    setConciergeOpen,
    trayItems,
    heldTable,
    selectedSlot,
    partySize,
  } = useReservationContext();

  const [scrollY, setScrollY] = useState(0);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const totalCount = trayItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile drawer automatically on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const scrolled = scrollY > 28;

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-500 ${
          scrolled || mobileMenuOpen
            ? "bg-obsidian/90 backdrop-blur-2xl border-b border-brass/25 shadow-[0_12px_40px_rgba(0,0,0,0.65)]"
            : "bg-gradient-to-b from-obsidian/92 via-obsidian/55 to-transparent border-b border-brass/10"
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Bespoke Celestial Identity */}
          <Link
            href="/"
            className="flex items-center gap-3 sm:gap-3.5 group shrink-0"
            data-cursor="RESERVE"
          >
            <CelestialAstrolabeLogo scrollY={scrollY} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-display text-base sm:text-xl tracking-[0.26em] sm:tracking-[0.3em] text-cream uppercase leading-none font-semibold group-hover:text-brass transition-colors">
                  Nocturne
                </span>
                <span className="hidden xl:inline-block w-1.5 h-1.5 rotate-45 bg-brass/70" />
                <span className="hidden xl:inline font-serif italic text-sm text-brass/90">
                  Dhaka
                </span>
              </div>
              <span className="font-mono text-[8.5px] sm:text-[9px] tracking-[0.24em] text-sand/75 uppercase mt-1">
                23.79°N • Banani Level 14
              </span>
            </div>
          </Link>

          {/* Editorial Numbered Chapter Links (Desktop & Tablet Landscape) */}
          <nav
            aria-label="Primary"
            onMouseLeave={() => setHoveredHref(null)}
            className="hidden lg:flex items-center gap-10"
          >
            {NAV_LINKS.map((item) => {
              const isActive = item.match(pathname);
              const showLine = hoveredHref ? hoveredHref === item.href : isActive;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onMouseEnter={() => setHoveredHref(item.href)}
                  className="relative py-2.5 flex items-baseline gap-2.5 group"
                >
                  <span
                    className={`font-mono text-[10px] tracking-[0.2em] transition-colors ${
                      isActive || hoveredHref === item.href
                        ? "text-brass"
                        : "text-sand/45 group-hover:text-brass/80"
                    }`}
                  >
                    {item.index}
                  </span>
                  <span
                    className={`font-syne text-[11px] uppercase tracking-[0.24em] transition-colors ${
                      isActive || hoveredHref === item.href
                        ? "text-cream font-bold"
                        : "text-sand/85 group-hover:text-cream"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.href === "/menu" && totalCount > 0 && (
                    <span className="font-mono text-[10px] text-brass tabular-nums">
                      ({totalCount})
                    </span>
                  )}
                  {showLine && (
                    <motion.span
                      layoutId="nav-editorial-rule"
                      transition={{ type: "spring", stiffness: 360, damping: 32 }}
                      className="absolute left-0 right-0 bottom-0 h-[1px] bg-gradient-to-r from-brass/30 via-brass to-brass/30"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Architectural Split Action Cluster */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Live Session Telemetry Strip */}
            <Link
              href="/reserve"
              className="hidden sm:flex items-center divide-x divide-brass/20 border border-brass/25 bg-charcoal/55 hover:border-brass/55 transition-colors"
              title="Inspect live evening seat telemetry"
            >
              {heldTable ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-ember font-mono text-[10.5px] uppercase tracking-wider tabular-nums">
                  <Lock className="w-3 h-3 animate-pulse" />
                  {heldTable.tableCode} HELD
                </span>
              ) : (
                <span className="px-3 py-2 font-mono text-[10.5px] text-sand uppercase tracking-wider tabular-nums">
                  {selectedSlot} • {partySize}P
                </span>
              )}

              {pathname !== "/reserve" && (
                <span className="hidden xl:inline-flex items-center gap-1.5 px-3.5 py-2 font-syne text-[10px] font-bold uppercase tracking-[0.2em] text-brass hover:text-cream transition-colors">
                  <span>Reserve</span>
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              )}
            </Link>

            {/* AI Sommelier Concierge Architectural Button */}
            <button
              type="button"
              onClick={() => setConciergeOpen((prev) => !prev)}
              data-cursor="RESERVE"
              className="relative group inline-flex items-center gap-2 px-3 sm:px-4 py-2 border border-brass/45 hover:border-brass bg-obsidian/80 text-cream transition-colors"
            >
              {/* Subtle brass architectural corner accents */}
              <span className="pointer-events-none absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-brass" />
              <span className="pointer-events-none absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-brass" />
              <Sparkles className="w-3.5 h-3.5 text-brass group-hover:rotate-12 transition-transform" />
              <span className="font-syne text-[10px] sm:text-[10.5px] uppercase tracking-[0.2em]">
                <span className="hidden xs:inline sm:inline">Concierge</span>
                <span className="sm:hidden">AI</span>
              </span>
              <span className="hidden md:inline font-mono text-[9.5px] text-brass/85 border-l border-brass/25 pl-2">
                ⌘J
              </span>
            </button>

            {/* Mobile & Tablet Chapter Toggle (< lg) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 border border-brass/30 bg-obsidian/80 text-cream hover:border-brass transition-colors"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Responsive Full-Height Mobile Navigation Drawer (< lg) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            data-lenis-prevent
            onWheelCapture={(e) => e.stopPropagation()}
            className="fixed inset-x-0 top-16 sm:top-20 bottom-0 z-30 lg:hidden bg-obsidian/96 backdrop-blur-2xl border-t border-brass/20 overflow-y-auto overscroll-contain flex flex-col justify-between p-6 pb-10"
          >
            <div className="space-y-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-brass/80 border-b border-brass/15 pb-3 flex items-center justify-between">
                <span>Nocturne Architecture</span>
                <span className="tabular-nums">
                  {selectedSlot} • {partySize} Guests
                </span>
              </div>

              <nav className="divide-y divide-brass/15">
                {NAV_LINKS.map((item) => {
                  const isActive = item.match(pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-between py-5 group"
                    >
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono text-xs text-brass">{item.index}</span>
                        <div>
                          <div
                            className={`font-display text-2xl uppercase tracking-[0.14em] ${
                              isActive ? "text-brass" : "text-cream group-hover:text-brass"
                            }`}
                          >
                            {item.label}
                          </div>
                          <div className="font-serif italic text-base text-sand/85">
                            {item.subtitle}
                            {item.href === "/menu" && totalCount > 0
                              ? ` (${totalCount} in tray)`
                              : ""}
                          </div>
                        </div>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-brass/70 group-hover:text-brass transition-colors" />
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-3 pt-6 border-t border-brass/20">
              {heldTable && (
                <Link
                  href="/reserve"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 px-4 border border-ember/50 bg-ember/10 text-ember font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Resume Active Hold: Table {heldTable.tableCode}</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setConciergeOpen(true);
                }}
                className="w-full py-3.5 px-4 border border-brass/40 bg-charcoal text-cream font-syne text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-brass" />
                <span>Ask Llama Culinary Concierge</span>
              </button>

              <Link
                href="/reserve"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3.5 px-4 bg-brass text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.22em] flex items-center justify-center gap-2"
              >
                <span>Lock Seat &amp; Pre-Order</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>

              <p className="pt-2 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-sand/65">
                Banani Road 11 • Level 14 Penthouse • Dhaka
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
