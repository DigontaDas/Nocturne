"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

export function PageTransitionCurtain() {
  const pathname = usePathname();
  const prevPathRef = useRef<string>(pathname);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    setTransitioning(true);
    const timer = window.setTimeout(() => setTransitioning(false), 540);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <AnimatePresence>
      {transitioning && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[80] pointer-events-none flex"
        >
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.52, ease: [0.76, 0, 0.24, 1] }}
            style={{ transformOrigin: "left center" }}
            className="w-1/2 h-full bg-obsidian border-r border-brass/50"
          />
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.52, ease: [0.76, 0, 0.24, 1] }}
            style={{ transformOrigin: "right center" }}
            className="w-1/2 h-full bg-obsidian border-l border-brass/50"
          />
        </div>
      )}
    </AnimatePresence>
  );
}
