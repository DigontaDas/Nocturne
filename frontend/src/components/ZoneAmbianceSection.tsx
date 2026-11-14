"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Flame, ShieldCheck, Volume2 } from "lucide-react";
import { fetchZones } from "@/lib/api";
import { FALLBACK_ZONES } from "@/lib/fallback-data";
import { useReservationContext } from "@/context/ReservationContext";

gsap.registerPlugin(ScrollTrigger);

const WING_TELEMETRY: Record<
  string,
  {
    indexCode: string;
    italicWord: string;
    badgeLabel: string;
    metricValue: string;
    metricNote: string;
  }
> = {
  rooftop: {
    indexCode: "WING 01",
    italicWord: "Skyline Horizon",
    badgeLabel: "Open-Air Acoustic Metering",
    metricValue: "52 dB",
    metricNote: "Banani Lake Evening Breeze",
  },
  "main-hall": {
    indexCode: "WING 02",
    italicWord: "Glass Hearth",
    badgeLabel: "Live Culinary Theater",
    metricValue: "420°C",
    metricNote: "White-Oak Ember Pass • 64 dB",
  },
  "private-lounge": {
    indexCode: "WING 03",
    italicWord: "Velvet Sanctuary",
    badgeLabel: "Acoustic Isolation Booths",
    metricValue: "46 dB",
    metricNote: "Smoked Glass Enclosure",
  },
};

const WAVEFORM_BARS = [16, 28, 42, 34, 52, 38, 22, 46, 30, 18];

export function ZoneAmbianceSection() {
  const { selectedDate, selectedSlot } = useReservationContext();
  const { data: zones = FALLBACK_ZONES } = useQuery({
    queryKey: ["zones", selectedDate, selectedSlot],
    queryFn: () => fetchZones(selectedDate, selectedSlot),
    initialData: FALLBACK_ZONES,
    staleTime: 25_000,
  });

  const sectionRef = useRef<HTMLElement | null>(null);
  const pinWrapperRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeWing, setActiveWing] = useState(0);

  const orderedZones = zones.length > 0 ? zones : FALLBACK_ZONES;

  useGSAP(
    () => {
      if (!pinWrapperRef.current || !trackRef.current) return;

      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        const tween = gsap.to(trackRef.current, {
          xPercent: -66.666667,
          ease: "none",
          scrollTrigger: {
            trigger: pinWrapperRef.current,
            start: "top top",
            end: () => `+=${Math.round(window.innerWidth * 2)}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const idx = Math.min(
                orderedZones.length - 1,
                Math.floor(self.progress * orderedZones.length)
              );
              setActiveWing(idx);
            },
          },
        });

        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: sectionRef, dependencies: [orderedZones.length] }
  );

  return (
    <section
      id="zones"
      ref={sectionRef}
      className="relative bg-obsidian text-cream border-t border-brass/15 overflow-x-clip"
    >
      <div
        ref={pinWrapperRef}
        className="relative lg:h-screen w-full lg:overflow-hidden flex flex-col"
      >
        {/* Top Architectural Wing Progress Telemetry Bar */}
        <div className="relative lg:absolute lg:top-24 lg:inset-x-0 z-30 px-4 sm:px-10 pt-10 pb-4 lg:p-0 lg:pointer-events-none">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-brass/25 pb-3 bg-obsidian/70 backdrop-blur-md px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.26em] sm:tracking-[0.3em] text-brass">
                Dining Wings
              </span>
              <span className="hidden lg:inline font-mono text-[10px] text-sand/70">
                Explore {orderedZones.length} rooftop dining environments
              </span>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              {orderedZones.map((zone, idx) => {
                const isActive = idx === activeWing;
                return (
                  <div
                    key={zone.slug}
                    className={`flex items-center gap-2 transition-opacity ${
                      isActive ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-brass">
                      0{idx + 1}
                    </span>
                    <span className="font-syne text-[10px] uppercase tracking-[0.2em] text-cream hidden md:inline">
                      {zone.name.replace(/^The\s+/i, "")}
                    </span>
                    <span
                      className={`h-px transition-all duration-300 ${
                        isActive ? "w-8 bg-brass" : "w-3 bg-brass/35"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stacked vertical cards on mobile/tablet (< 1024px); horizontal 300vw track on desktop */}
        <div
          ref={trackRef}
          className="flex flex-col lg:flex-row lg:h-full w-full lg:w-[300vw] lg:will-change-transform"
        >
          {orderedZones.map((zone, index) => {
            const meta = WING_TELEMETRY[zone.slug] ?? {
              indexCode: `WING 0${index + 1}`,
              italicWord: zone.name,
              badgeLabel: "Acoustic Environment",
              metricValue: `${zone.ambient_noise_db} dB`,
              metricNote: zone.vibe_tagline,
            };

            return (
              <article
                key={zone.slug}
                className="relative w-full lg:w-screen min-h-[540px] sm:min-h-[600px] lg:min-h-0 lg:h-full shrink-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-brass/20 flex items-end"
              >
                {/* Full-Bleed Video Background */}
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster={zone.preview_image_url}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                >
                  <source src={zone.preview_video_url} type="video/mp4" />
                </video>

                {/* Dramatic Obsidian Contrast Overlays */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/55 to-obsidian/35"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-r from-obsidian/90 via-obsidian/35 to-transparent"
                />

                {/* Wing Foreground Content */}
                <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-10 pb-12 sm:pb-16 pt-36 grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
                  <div className="lg:col-span-7 space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-brass border border-brass/40 bg-obsidian/70 px-3 py-1">
                        {meta.indexCode} &bull; {selectedSlot}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-cream/85 border border-brass/20 bg-obsidian/65 px-3 py-1 tabular-nums">
                        {zone.available_count} / {zone.table_count} Tables Open
                      </span>
                    </div>

                    <h2 className="font-display text-4xl sm:text-6xl lg:text-7xl tracking-[0.06em] uppercase text-cream leading-[0.98]">
                      {zone.name.replace(/^The\s+/i, "")}{" "}
                      <span className="block font-serif italic font-normal normal-case tracking-normal text-brass mt-1">
                        {meta.italicWord}
                      </span>
                    </h2>

                    <p className="max-w-xl font-sans text-sm sm:text-base font-light text-sand/90 leading-relaxed">
                      {zone.description}
                    </p>

                    <div className="pt-2 flex flex-wrap items-center gap-4">
                      <Link
                        href={`/reserve?zone=${encodeURIComponent(zone.slug)}`}
                        data-cursor="RESERVE"
                        className="inline-flex items-center gap-3 px-6 py-3.5 bg-brass hover:bg-brass-soft text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.22em] transition-colors"
                      >
                        <span>Inspect Floorplan Zone</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                      <span className="font-mono text-xs text-sand/80">
                        {zone.vibe_tagline}
                      </span>
                    </div>
                  </div>

                  {/* Right Floating Telemetry Slab */}
                  <div className="lg:col-span-5 lg:justify-self-end w-full max-w-md bg-obsidian/80 backdrop-blur-xl border border-brass/30 p-6">
                    <div className="flex items-start justify-between gap-4 border-b border-brass/20 pb-4">
                      <div>
                        <span className="font-syne text-[10px] uppercase tracking-[0.24em] text-brass">
                          {meta.badgeLabel}
                        </span>
                        <div className="mt-1 font-mono text-3xl sm:text-4xl text-cream tabular-nums">
                          {meta.metricValue}
                        </div>
                      </div>

                      <div className="w-10 h-10 border border-brass/35 flex items-center justify-center text-brass shrink-0">
                        {zone.slug === "main-hall" ? (
                          <Flame className="w-4 h-4" />
                        ) : zone.slug === "private-lounge" ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </div>
                    </div>

                    {/* Animated Live Acoustic / Thermal Waveform */}
                    <div className="mt-4 flex items-end justify-between gap-4">
                      <div>
                        <div className="font-sans text-xs text-cream">
                          {meta.metricNote}
                        </div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-sand/75">
                          Measured Ambient Index: {zone.ambient_noise_db} dB
                        </div>
                      </div>

                      <svg
                        viewBox="0 0 110 44"
                        className="w-28 h-10 shrink-0 text-brass"
                        aria-hidden="true"
                      >
                        {WAVEFORM_BARS.map((height, barIdx) => {
                          const normalizedHeight =
                            zone.slug === "main-hall"
                              ? Math.min(40, Math.round(height * 0.92))
                              : zone.slug === "private-lounge"
                              ? Math.max(8, Math.round(height * 0.45))
                              : Math.round(height * 0.72);
                          return (
                            <rect
                              key={barIdx}
                              x={barIdx * 11 + 2}
                              y={42 - normalizedHeight}
                              width="4"
                              height={normalizedHeight}
                              fill="currentColor"
                              fillOpacity={0.35 + (barIdx % 3) * 0.22}
                            >
                              <animate
                                attributeName="height"
                                values={`${Math.max(6, normalizedHeight - 10)};${normalizedHeight};${Math.max(8, normalizedHeight - 6)}`}
                                dur={`${1.4 + (barIdx % 4) * 0.35}s`}
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="y"
                                values={`${42 - Math.max(6, normalizedHeight - 10)};${42 - normalizedHeight};${42 - Math.max(8, normalizedHeight - 6)}`}
                                dur={`${1.4 + (barIdx % 4) * 0.35}s`}
                                repeatCount="indefinite"
                              />
                            </rect>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
