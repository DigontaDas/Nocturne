"use client";

import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactLenis, useLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReservationProvider, useReservationContext } from "@/context/ReservationContext";

gsap.registerPlugin(ScrollTrigger);

function LenisScrollTriggerSync() {
  const { conciergeOpen } = useReservationContext();
  const lenis = useLenis(() => {
    ScrollTrigger.update();
  });

  useEffect(() => {
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 120);
    return () => window.clearTimeout(id);
  }, []);

  // Freeze main-page Lenis + body scroll whenever the AI Concierge drawer is open
  useEffect(() => {
    if (conciergeOpen) {
      lenis?.stop();
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      lenis?.start();
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      lenis?.start();
    };
  }, [conciergeOpen, lenis]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ReservationProvider>
        <ReactLenis
          root
          options={{
            lerp: 0.08,
            duration: 1.2,
            smoothWheel: true,
          }}
        >
          <LenisScrollTriggerSync />
          {children}
        </ReactLenis>
      </ReservationProvider>
    </QueryClientProvider>
  );
}
