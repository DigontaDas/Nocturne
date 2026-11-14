"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
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
    subtitle: "Acoustic Sightlines",
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

function NocturneEmblem({ scrollY }: { scrollY: number }) {
  const rot = (scrollY * 0.08) % 360;

  return (
    <div
      className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full overflow-hidden border border-brass/30 bg-obsidian flex items-center justify-center"
      style={{ transform: `rotate(${rot}deg)` }}
    >
      <img
        src="/web-app-manifest-192x192.png"
        alt="Nocturne emblem"
        className="w-full h-full object-contain scale-105 mix-blend-lighten"
      />
    </div>
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
          {/* Nocturne Emblem & Wordmark */}
          <Link
            href="/"
            className="flex items-center gap-3 sm:gap-3.5 group shrink-0"
            data-cursor="RESERVE"
          >
            <NocturneEmblem scrollY={scrollY} />
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
              <span className="font-sans text-[10px] tracking-[0.2em] text-sand/75 uppercase mt-1 tabular-nums">
                Banani Level 14
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
                    className={`font-sans text-[10px] tracking-[0.18em] tabular-nums transition-colors ${
                      isActive || hoveredHref === item.href
                        ? "text-brass"
                        : "text-sand/45 group-hover:text-brass/80"
                    }`}
                  >
                    {item.index}
                  </span>
                  <span
                    className={`font-sans text-[11px] uppercase tracking-[0.2em] font-medium transition-colors ${
                      isActive || hoveredHref === item.href
                        ? "text-cream"
                        : "text-sand/85 group-hover:text-cream"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.href === "/menu" && totalCount > 0 && (
                    <span className="font-sans text-[11px] text-brass tabular-nums">
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
              title="Inspect active seating & dining window"
            >
              {heldTable ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-ember font-sans text-[11px] font-medium uppercase tracking-[0.14em] tabular-nums">
                  {heldTable.tableCode} Held
                </span>
              ) : (
                <span className="px-3.5 py-2 font-sans text-[11px] text-sand uppercase tracking-[0.14em] tabular-nums">
                  {selectedSlot} &middot; {partySize}P
                </span>
              )}

              {pathname !== "/reserve" && (
                <span className="hidden xl:inline-flex items-center px-4 py-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-brass hover:text-cream transition-colors">
                  Reserve
                </span>
              )}
            </Link>

            {/* Concierge Drawer Button */}
            <button
              type="button"
              onClick={() => setConciergeOpen((prev) => !prev)}
              data-cursor="RESERVE"
              className="relative inline-flex items-center px-4 py-2 border border-brass/45 hover:border-brass bg-obsidian/80 text-cream transition-colors"
            >
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.18em]">
                <span className="hidden sm:inline">Concierge</span>
                <span className="sm:hidden">Ask</span>
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
              <div className="font-sans text-[11px] uppercase tracking-[0.2em] text-brass/85 border-b border-brass/15 pb-3 flex items-center justify-between">
                <span>Nocturne Architecture</span>
                <span className="tabular-nums">
                  {selectedSlot} &middot; {partySize} Guests
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
                        <span className="font-sans text-xs text-brass tabular-nums">{item.index}</span>
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
                  className="w-full py-3 px-4 border border-ember/50 bg-ember/10 text-ember font-sans text-xs font-medium uppercase tracking-[0.14em] flex items-center justify-center"
                >
                  <span>Resume Active Hold: Table {heldTable.tableCode}</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setConciergeOpen(true);
                }}
                className="w-full py-3.5 px-4 border border-brass/40 bg-charcoal text-cream font-sans text-xs font-medium uppercase tracking-[0.18em] flex items-center justify-center"
              >
                <span>Ask Our Maître d&apos; &amp; Sommelier</span>
              </button>

              <Link
                href="/reserve"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3.5 px-4 bg-brass text-obsidian font-sans text-xs font-semibold uppercase tracking-[0.18em] flex items-center justify-center"
              >
                <span>Lock Seat &amp; Pre-Order</span>
              </Link>

              <p className="pt-2 text-center font-sans text-[11px] uppercase tracking-[0.18em] text-sand/65">
                Banani Road 11 &middot; Level 14 Penthouse &middot; Dhaka
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
