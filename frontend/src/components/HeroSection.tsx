"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  Calendar,
  Clock,
  Sparkles,
  Users,
} from "lucide-react";
import { useReservationContext } from "@/context/ReservationContext";

gsap.registerPlugin(ScrollTrigger);

const TIME_SLOTS = ["19:00", "20:30", "22:00"] as const;

export function HeroSection() {
  const router = useRouter();
  const {
    selectedDate,
    setSelectedDate,
    selectedSlot,
    setSelectedSlot,
    partySize,
    setPartySize,
    setConciergeOpen,
  } = useReservationContext();

  const sectionRef = useRef<HTMLElement | null>(null);
  const pinStageRef = useRef<HTMLDivElement | null>(null);
  const apertureRef = useRef<HTMLDivElement | null>(null);
  const titleLeftRef = useRef<HTMLDivElement | null>(null);
  const titleRightRef = useRef<HTMLDivElement | null>(null);
  const bookingBarRef = useRef<HTMLFormElement | null>(null);
  const scrollHintRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(min-width: 768px)", () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pinStageRef.current,
            start: "top top",
            end: "+=115%",
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        tl.fromTo(
          apertureRef.current,
          {
            width: "48vw",
            height: "62vh",
            borderRadius: "260px 260px 6px 6px",
          },
          {
            width: "100vw",
            height: "100vh",
            borderRadius: "0px 0px 0px 0px",
            ease: "power2.inOut",
          },
          0
        )
          .to(
            titleLeftRef.current,
            {
              x: -90,
              y: -50,
              opacity: 0.14,
              ease: "power2.out",
            },
            0
          )
          .to(
            titleRightRef.current,
            {
              x: 90,
              y: 50,
              opacity: 0.14,
              ease: "power2.out",
            },
            0
          )
          .to(
            scrollHintRef.current,
            {
              opacity: 0,
              y: -12,
              ease: "power1.out",
            },
            0
          )
          .fromTo(
            bookingBarRef.current,
            {
              y: 18,
              borderColor: "rgba(212, 175, 55, 0.25)",
            },
            {
              y: 0,
              borderColor: "rgba(212, 175, 55, 0.6)",
              ease: "power2.out",
            },
            0.15
          );
      });

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  const handleFindSeats = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(
      `/reserve?date=${encodeURIComponent(selectedDate)}&slot=${encodeURIComponent(
        selectedSlot
      )}&guests=${partySize}`
    );
  };

  return (
    <section
      ref={sectionRef}
      className="relative bg-obsidian text-cream overflow-x-clip border-b border-brass/15"
    >
      <div
        ref={pinStageRef}
        className="relative min-h-[100svh] md:h-screen w-full overflow-hidden flex flex-col md:flex-row items-center justify-between md:justify-center bg-obsidian pt-20 pb-6 md:pt-20 md:pb-24 px-4 sm:px-6 md:px-0 gap-5 md:gap-0"
      >
        {/* Subtle Architectural Grid Backdrop Surrounding the Keyhole */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.06)_0%,rgba(14,13,12,0)_62%)]"
        />

        {/* Top Split Wordmark (flows naturally at top on mobile, pinned left on tablet/desktop) */}
        <div
          ref={titleLeftRef}
          className="w-full md:w-auto md:pointer-events-none md:absolute md:top-28 md:left-12 z-20 select-none flex items-end justify-between md:block pt-2 md:pt-0"
        >
          <div>
            <p className="font-syne text-[9.5px] sm:text-xs uppercase tracking-[0.28em] sm:tracking-[0.34em] text-brass/90 mb-1.5 sm:mb-2">
              01 / Banani Rooftop • Level 14
            </p>
            <h1 className="font-display text-3xl sm:text-5xl lg:text-[5.1rem] tracking-[0.2em] sm:tracking-[0.22em] text-cream leading-none">
              RESERVE
            </h1>
            <p className="mt-3 max-w-xs font-sans text-xs sm:text-sm font-light text-sand/85 leading-relaxed hidden md:block">
              Architect-drawn skyline tables, white-oak ember dining, and live two-phase seat locking.
            </p>
          </div>
          <div className="md:hidden text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-brass/80">
              44–66 dB
            </p>
            <div className="font-serif italic text-3xl text-brass leading-none">
              Perspective
            </div>
          </div>
        </div>

        {/* Bottom-Right Split Wordmark (tablet & desktop overlay) */}
        <div
          ref={titleRightRef}
          className="hidden md:block pointer-events-none absolute bottom-36 right-12 z-20 text-right select-none"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brass/80 mb-1">
            44 dB — 66 dB Metered Sightlines
          </p>
          <div className="font-serif italic text-6xl lg:text-[6rem] text-brass leading-[0.88] tracking-tight">
            Perspective
          </div>
        </div>

        {/* Viewport-Masking Architectural Keyhole Frame */}
        <div
          ref={apertureRef}
          className="relative z-10 overflow-hidden border border-brass/35 bg-charcoal shadow-[0_32px_90px_rgba(0,0,0,0.88)] will-change-[width,height,border-radius] w-full max-w-[330px] sm:max-w-[380px] h-[38vh] min-h-[260px] rounded-t-[180px] rounded-b-[6px] md:max-w-none md:w-[48vw] md:h-[62vh] md:rounded-t-[260px]"
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/media/rooftop-view.png"
            className="h-full w-full object-cover object-center scale-[1.02]"
          >
            <source src="/media/hero-ambiance.mp4" type="video/mp4" />
          </video>

          {/* Deep Cinema Vignette */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/20 to-obsidian/45"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 border border-brass/20 rounded-[inherit]"
          />

          {/* Subtle Inner Keyhole Telemetry */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 bg-obsidian/65 backdrop-blur-md border border-brass/25">
            <span className="w-1.5 h-1.5 rounded-full bg-brass animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-cream/90 whitespace-nowrap">
              Gulshan &bull; Banani Horizon
            </span>
          </div>
        </div>

        {/* Minimalist Scroll Cue */}
        <div
          ref={scrollHintRef}
          className="pointer-events-none absolute bottom-28 sm:bottom-32 left-6 sm:left-12 z-20 hidden lg:flex items-center gap-3"
        >
          <div className="w-12 h-px bg-brass/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-sand/80">
            Scroll to Expand Viewport
          </span>
        </div>

        {/* Architectural 1px Brass Hairline Quick Booking Bar */}
        <div className="w-full md:absolute md:bottom-7 md:inset-x-0 z-30 md:px-8">
          <form
            ref={bookingBarRef}
            onSubmit={handleFindSeats}
            className="max-w-5xl mx-auto bg-obsidian/88 backdrop-blur-xl border border-brass/35 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 items-stretch divide-y sm:divide-y-0 sm:divide-x divide-brass/20"
          >
            {/* Date Picker */}
            <label className="lg:col-span-3 flex flex-col justify-center px-4 py-3 cursor-pointer hover:bg-charcoal/50 transition-colors">
              <span className="font-syne text-[10px] uppercase tracking-[0.24em] text-brass flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Evening Date
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                required
                className="mt-1 bg-transparent font-mono text-sm text-cream focus:outline-none [color-scheme:dark]"
              />
            </label>

            {/* Seating Slot */}
            <div className="lg:col-span-3 flex flex-col justify-center px-4 py-3">
              <span className="font-syne text-[10px] uppercase tracking-[0.24em] text-brass flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Seating Time
              </span>
              <div className="mt-1.5 flex items-center gap-1.5">
                {TIME_SLOTS.map((slot) => {
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-2.5 py-1 font-mono text-xs border transition-colors ${
                        active
                          ? "bg-brass text-obsidian border-brass font-medium"
                          : "bg-transparent text-sand border-brass/25 hover:border-brass/60 hover:text-cream"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Guest Count */}
            <div className="lg:col-span-2 flex flex-col justify-center px-4 py-3">
              <span className="font-syne text-[10px] uppercase tracking-[0.24em] text-brass flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Party
              </span>
              <div className="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  className="w-6 h-6 border border-brass/30 text-cream hover:border-brass font-mono text-xs flex items-center justify-center transition-colors"
                  aria-label="Decrease guests"
                >
                  -
                </button>
                <span className="font-mono text-sm text-cream tabular-nums">
                  {partySize} {partySize === 1 ? "Guest" : "Guests"}
                </span>
                <button
                  type="button"
                  onClick={() => setPartySize(Math.min(6, partySize + 1))}
                  className="w-6 h-6 border border-brass/30 text-cream hover:border-brass font-mono text-xs flex items-center justify-center transition-colors"
                  aria-label="Increase guests"
                >
                  +
                </button>
              </div>
            </div>

            {/* Action Cell */}
            <div className="lg:col-span-4 flex items-stretch divide-x divide-brass/20">
              <button
                type="submit"
                data-cursor="RESERVE"
                className="flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 bg-brass hover:bg-brass-soft text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.2em] transition-colors"
              >
                <span>Inspect Tables</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setConciergeOpen(true)}
                aria-label="Open AI Culinary Concierge"
                className="px-4 py-3.5 bg-charcoal/80 hover:bg-charcoal text-brass hover:text-cream transition-colors flex items-center justify-center gap-1.5"
                title="AI Culinary Concierge (Ctrl+J)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] hidden sm:inline">
                  AI
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
