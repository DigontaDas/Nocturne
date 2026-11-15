"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronsDown,
  ChevronsUp,
} from "lucide-react";
import { useReservationContext } from "@/context/ReservationContext";

interface SectionLandmark {
  id: string;
  label: string;
  top: number;
}

function getSectionDocumentTop(el: HTMLElement): number {
  const spacer = el.parentElement?.classList.contains("pin-spacer")
    ? el.parentElement
    : el;
  return Math.max(
    0,
    Math.round(spacer.getBoundingClientRect().top + window.scrollY)
  );
}

function readLandmarksFromDom(): SectionLandmark[] {
  if (typeof window === "undefined") return [];
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-scroll-section]")
  );

  const items: SectionLandmark[] = [];
  for (const node of nodes) {
    const label = node.dataset.scrollLabel?.trim();
    if (!label) continue;
    const id = node.id || label.toLowerCase().replace(/\s+/g, "-");
    items.push({
      id,
      label,
      top: getSectionDocumentTop(node),
    });
  }

  return items.sort((a, b) => a.top - b.top);
}

export function FastScrollRail() {
  const pathname = usePathname();
  const lenis = useLenis();
  const { conciergeOpen } = useReservationContext();

  const [landmarks, setLandmarks] = useState<SectionLandmark[]>([]);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [maxScroll, setMaxScroll] = useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [holdingDir, setHoldingDir] = useState<-1 | 0 | 1>(0);

  const holdTimeoutRef = useRef<number | null>(null);
  const holdRafRef = useRef<number | null>(null);
  const holdingActiveRef = useRef<boolean>(false);
  const lastFrameTimeRef = useRef<number>(0);

  const syncMetrics = useCallback(() => {
    if (typeof window === "undefined") return;
    const docMax = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const y = window.scrollY || window.pageYOffset || 0;
    const pct = docMax > 0 ? Math.min(1, Math.max(0, y / docMax)) : 0;

    setMaxScroll(docMax);
    setScrollProgress(pct);

    const measured = readLandmarksFromDom();
    if (measured.length > 0) {
      setLandmarks(measured);
      const triggerLine = y + window.innerHeight * 0.35;
      let current = 0;
      for (let i = 0; i < measured.length; i += 1) {
        if (measured[i].top <= triggerLine) {
          current = i;
        }
      }
      setActiveIndex(current);
    } else {
      setLandmarks([]);
    }
  }, []);

  useEffect(() => {
    syncMetrics();
    const t1 = window.setTimeout(syncMetrics, 220);
    const t2 = window.setTimeout(syncMetrics, 750);

    const handleScroll = () => syncMetrics();
    const handleResize = () => syncMetrics();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });

    const observer = new ResizeObserver(() => syncMetrics());
    observer.observe(document.body);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [pathname, syncMetrics]);

  const scrollToY = useCallback(
    (targetY: number, duration = 0.42) => {
      if (typeof window === "undefined") return;
      const clamped = Math.max(0, Math.min(maxScroll || document.documentElement.scrollHeight, targetY));
      if (lenis) {
        lenis.scrollTo(clamped, {
          duration,
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
      } else {
        window.scrollTo({
          top: clamped,
          behavior: "smooth",
        });
      }
    },
    [lenis, maxScroll]
  );

  const jumpFast = useCallback(
    (direction: -1 | 1) => {
      if (typeof window === "undefined") return;
      const y = window.scrollY || 0;
      const step = Math.max(580, Math.round(window.innerHeight * 0.88));
      const latestLandmarks = readLandmarksFromDom();

      if (direction === 1) {
        const nextLandmark = latestLandmarks.find((lm) => lm.top > y + 80);
        const target =
          nextLandmark && nextLandmark.top - y <= step * 1.45
            ? nextLandmark.top
            : y + step;
        scrollToY(Math.min(maxScroll, target), 0.36);
      } else {
        const prevLandmarks = latestLandmarks.filter((lm) => lm.top < y - 80);
        const prevLandmark = prevLandmarks[prevLandmarks.length - 1];
        const target =
          prevLandmark && y - prevLandmark.top <= step * 1.45
            ? prevLandmark.top
            : y - step;
        scrollToY(Math.max(0, target), 0.36);
      }
    },
    [maxScroll, scrollToY]
  );

  const stopHoldScroll = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdRafRef.current !== null) {
      window.cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }
    setHoldingDir(0);
  }, []);

  const beginHoldScroll = useCallback(
    (direction: -1 | 1) => {
      stopHoldScroll();
      holdingActiveRef.current = false;

      holdTimeoutRef.current = window.setTimeout(() => {
        holdingActiveRef.current = true;
        setHoldingDir(direction);
        lastFrameTimeRef.current = performance.now();

        const stepFrame = (now: number) => {
          const dt = Math.min(0.05, (now - lastFrameTimeRef.current) / 1000);
          lastFrameTimeRef.current = now;
          const speedPxPerSec = 3000;
          const delta = direction * speedPxPerSec * dt;
          const docLimit = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
          );
          const nextY = Math.max(
            0,
            Math.min(docLimit, (window.scrollY || 0) + delta)
          );

          if (lenis) {
            lenis.scrollTo(nextY, { immediate: true });
          } else {
            window.scrollTo({ top: nextY });
          }

          if (
            (direction === 1 && nextY >= docLimit - 1) ||
            (direction === -1 && nextY <= 1)
          ) {
            stopHoldScroll();
            return;
          }

          holdRafRef.current = window.requestAnimationFrame(stepFrame);
        };

        holdRafRef.current = window.requestAnimationFrame(stepFrame);
      }, 170);
    },
    [lenis, stopHoldScroll]
  );

  useEffect(() => {
    return () => stopHoldScroll();
  }, [stopHoldScroll]);

  // Keyboard alternative: Alt + ArrowUp / ArrowDown / Home / End
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (conciergeOpen || !e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        jumpFast(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        jumpFast(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        scrollToY(0, 0.45);
      } else if (e.key === "End") {
        e.preventDefault();
        scrollToY(maxScroll, 0.45);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [conciergeOpen, jumpFast, maxScroll, scrollToY]);

  if (conciergeOpen || maxScroll < 140) {
    return null;
  }

  const percentText = `${Math.round(scrollProgress * 100)}%`;
  const atTop = scrollProgress <= 0.01;
  const atBottom = scrollProgress >= 0.99;

  return (
    <>
      {/* Desktop / Tablet Vertical Fast Scroll Rail */}
      <aside
        aria-label="Fast scroll navigation"
        className="hidden md:flex fixed right-3.5 top-1/2 -translate-y-1/2 z-40 pointer-events-none select-none"
      >
        <div className="group pointer-events-auto flex flex-col items-center gap-1.5 px-2 py-2.5 glass-obsidian shadow-card">
          <button
            type="button"
            disabled={atTop}
            onClick={() => scrollToY(0, 0.48)}
            title="Jump to Top (Alt + Home)"
            aria-label="Jump to top of page"
            className="w-8 h-8 flex items-center justify-center border border-brass/25 bg-obsidian/80 text-cream hover:border-brass hover:text-brass disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ArrowUpToLine className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={atTop}
            onPointerDown={() => beginHoldScroll(-1)}
            onPointerUp={stopHoldScroll}
            onPointerLeave={stopHoldScroll}
            onPointerCancel={stopHoldScroll}
            onClick={() => {
              if (holdingActiveRef.current) {
                holdingActiveRef.current = false;
                return;
              }
              jumpFast(-1);
            }}
            title="Scroll Up Fast — Click or Hold (Alt + Up)"
            aria-label="Scroll up fast"
            className={`w-8 h-8 flex items-center justify-center border transition-colors ${
              holdingDir === -1
                ? "border-brass bg-brass text-obsidian"
                : "border-brass/25 bg-obsidian/80 text-brass hover:border-brass hover:bg-brass/15"
            } disabled:opacity-30 disabled:pointer-events-none`}
          >
            <ChevronsUp className="w-4 h-4" />
          </button>

          {/* Section Notches + Live Depth Gauge */}
          <div className="py-1.5 px-0.5 flex flex-col items-center gap-2 border-y border-brass/20 w-full">
            <div className="relative w-1 h-24 bg-brass/15 overflow-hidden">
              <div
                className="w-full bg-brass transition-all duration-150"
                style={{ height: `${Math.max(8, Math.round(scrollProgress * 100))}%` }}
              />
            </div>

            {landmarks.length > 1 && (
              <div className="flex flex-col items-center gap-1.5 py-0.5">
                {landmarks.map((lm, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={`${lm.id}-${idx}`}
                      type="button"
                      onClick={() => scrollToY(lm.top, 0.45)}
                      title={`Jump to ${lm.label}`}
                      aria-label={`Jump to ${lm.label}`}
                      className="relative group/notch flex items-center justify-center w-6 h-3.5 focus:outline-none"
                    >
                      <span
                        className={`block transition-all ${
                          isActive
                            ? "w-4 h-1 bg-brass"
                            : "w-2 h-px bg-sand/55 group-hover/notch:w-3.5 group-hover/notch:bg-brass"
                        }`}
                      />
                      <span className="pointer-events-none opacity-0 group-hover/notch:opacity-100 absolute right-8 whitespace-nowrap px-2 py-0.5 bg-obsidian border border-brass/35 font-sans text-[10px] uppercase tracking-[0.16em] text-cream transition-opacity">
                        {lm.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <span className="font-mono text-[9px] tabular-nums text-sand/85">
              {percentText}
            </span>
          </div>

          <button
            type="button"
            disabled={atBottom}
            onPointerDown={() => beginHoldScroll(1)}
            onPointerUp={stopHoldScroll}
            onPointerLeave={stopHoldScroll}
            onPointerCancel={stopHoldScroll}
            onClick={() => {
              if (holdingActiveRef.current) {
                holdingActiveRef.current = false;
                return;
              }
              jumpFast(1);
            }}
            title="Scroll Down Fast — Click or Hold (Alt + Down)"
            aria-label="Scroll down fast"
            className={`w-8 h-8 flex items-center justify-center border transition-colors ${
              holdingDir === 1
                ? "border-brass bg-brass text-obsidian"
                : "border-brass/25 bg-obsidian/80 text-brass hover:border-brass hover:bg-brass/15"
            } disabled:opacity-30 disabled:pointer-events-none`}
          >
            <ChevronsDown className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={atBottom}
            onClick={() => scrollToY(maxScroll, 0.48)}
            title="Jump to Bottom (Alt + End)"
            aria-label="Jump to bottom of page"
            className="w-8 h-8 flex items-center justify-center border border-brass/25 bg-obsidian/80 text-cream hover:border-brass hover:text-brass disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Mobile Compact Bottom-Right Fast Scroll Capsule */}
      <div
        role="region"
        aria-label="Mobile fast scroll controls"
        className="md:hidden fixed bottom-4 right-3 z-30 flex items-center gap-1 p-1 glass-obsidian shadow-card select-none"
      >
        <button
          type="button"
          disabled={atTop}
          onClick={() => scrollToY(0, 0.42)}
          aria-label="Jump to top"
          className="w-8 h-8 flex items-center justify-center border border-brass/25 bg-obsidian/85 text-cream disabled:opacity-30"
        >
          <ArrowUpToLine className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={atTop}
          onPointerDown={() => beginHoldScroll(-1)}
          onPointerUp={stopHoldScroll}
          onPointerLeave={stopHoldScroll}
          onPointerCancel={stopHoldScroll}
          onClick={() => {
            if (holdingActiveRef.current) {
              holdingActiveRef.current = false;
              return;
            }
            jumpFast(-1);
          }}
          aria-label="Scroll up fast"
          className={`h-8 px-2 flex items-center gap-1 border text-[10px] font-sans uppercase tracking-[0.12em] ${
            holdingDir === -1
              ? "border-brass bg-brass text-obsidian"
              : "border-brass/30 bg-obsidian/85 text-brass"
          } disabled:opacity-30`}
        >
          <ChevronsUp className="w-3.5 h-3.5" />
          <span>Up</span>
        </button>

        <span className="px-1.5 font-mono text-[9px] tabular-nums text-sand/90">
          {percentText}
        </span>

        <button
          type="button"
          disabled={atBottom}
          onPointerDown={() => beginHoldScroll(1)}
          onPointerUp={stopHoldScroll}
          onPointerLeave={stopHoldScroll}
          onPointerCancel={stopHoldScroll}
          onClick={() => {
            if (holdingActiveRef.current) {
              holdingActiveRef.current = false;
              return;
            }
            jumpFast(1);
          }}
          aria-label="Scroll down fast"
          className={`h-8 px-2 flex items-center gap-1 border text-[10px] font-sans uppercase tracking-[0.12em] ${
            holdingDir === 1
              ? "border-brass bg-brass text-obsidian"
              : "border-brass/30 bg-obsidian/85 text-brass"
          } disabled:opacity-30`}
        >
          <span>Down</span>
          <ChevronsDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={atBottom}
          onClick={() => scrollToY(maxScroll, 0.42)}
          aria-label="Jump to bottom"
          className="w-8 h-8 flex items-center justify-center border border-brass/25 bg-obsidian/85 text-cream disabled:opacity-30"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}
