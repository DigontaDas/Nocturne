"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export function CustomBrassCursor() {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cursorLabel, setCursorLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer) return;
    setEnabled(true);

    const ring = ringRef.current;
    if (!ring) return;

    const xTo = gsap.quickTo(ring, "x", { duration: 0.34, ease: "power3.out" });
    const yTo = gsap.quickTo(ring, "y", { duration: 0.34, ease: "power3.out" });

    const onMouseMove = (e: MouseEvent) => {
      if (!visible) setVisible(true);
      xTo(e.clientX);
      yTo(e.clientY);

      const target = (e.target as HTMLElement | null)?.closest("[data-cursor]");
      const nextLabel = target?.getAttribute("data-cursor") || null;
      setCursorLabel(nextLabel);
    };

    const onMouseLeaveWindow = () => setVisible(false);

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeaveWindow);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeaveWindow);
    };
  }, [visible]);

  if (!enabled) return null;

  const isExpanded = Boolean(cursorLabel);

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[90] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className={`flex items-center justify-center rounded-full border border-brass transition-all duration-300 ${
          isExpanded
            ? "w-[72px] h-[72px] bg-obsidian/80 backdrop-blur-sm"
            : "w-[28px] h-[28px] bg-transparent"
        }`}
      >
        {cursorLabel && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-brass">
            {cursorLabel}
          </span>
        )}
      </div>
    </div>
  );
}
