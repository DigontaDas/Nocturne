"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  Compass,
  Flame,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useReservationContext } from "@/context/ReservationContext";

gsap.registerPlugin(ScrollTrigger);

const PHILOSOPHY_PILLARS = [
  {
    icon: ShieldCheck,
    title: "100% Zabiha Halal & Traceable",
    detail:
      "35-day Himalayan salt-aged Australian Wagyu and accredited export cuts prepared with zero alcohol glazes.",
  },
  {
    icon: Flame,
    title: "Color-Coded Allergen Lines",
    detail:
      "Separate cold-pressed olive-oil cast-iron skillets protect Dairy-Free, Nut-Free, and Celiac-safe plates.",
  },
  {
    icon: Compass,
    title: "Verified dB Table Sightlines",
    detail:
      "Every Banani 14th-floor table is acoustically metered from 46 dB velvet booths to 64 dB kitchen seats.",
  },
] as const;

const MINI_TABLES = [
  { code: "T-01", x: 58, y: 66, zone: "rooftop" },
  { code: "T-02", x: 58, y: 120, zone: "rooftop" },
  { code: "T-03", x: 58, y: 174, zone: "rooftop" },
  { code: "T-04", x: 112, y: 90, zone: "rooftop" },
  { code: "T-07", x: 196, y: 82, zone: "main-hall" },
  { code: "T-08", x: 196, y: 145, zone: "main-hall" },
  { code: "T-09", x: 252, y: 82, zone: "main-hall" },
  { code: "T-10", x: 252, y: 145, zone: "main-hall" },
  { code: "B-01", x: 345, y: 68, zone: "private-lounge" },
  { code: "B-02", x: 345, y: 138, zone: "private-lounge" },
  { code: "B-03", x: 345, y: 208, zone: "private-lounge" },
] as const;

const CONCIERGE_QUICK_PROMPTS = [
  "Quiet 2-seater <=52 dB + dairy-free main under ৳3,500",
  "Best sunset Banani Lake window booth + zero-proof pairing",
  "Strict nut-free & celiac-safe 3-course menu tonight",
] as const;

export function CulinaryPhilosophySection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const splitStageRef = useRef<HTMLDivElement | null>(null);
  const leftCurtainRef = useRef<HTMLDivElement | null>(null);
  const rightCurtainRef = useRef<HTMLDivElement | null>(null);
  const centerRevealRef = useRef<HTMLDivElement | null>(null);

  const { openConciergeWithPrompt } = useReservationContext();
  const [promptDraft, setPromptDraft] = useState<string>("");

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: splitStageRef.current,
            start: "top 72%",
            end: "top 14%",
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });

        tl.fromTo(
          leftCurtainRef.current,
          { xPercent: 18 },
          { xPercent: 0, ease: "power2.out" },
          0
        )
          .fromTo(
            rightCurtainRef.current,
            { xPercent: -18 },
            { xPercent: 0, ease: "power2.out" },
            0
          )
          .fromTo(
            centerRevealRef.current,
            { opacity: 0.35, scale: 0.96 },
            { opacity: 1, scale: 1, ease: "power2.out" },
            0.15
          );
      });

      gsap.from(".philosophy-cell", {
        y: 22,
        opacity: 0,
        duration: 0.7,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".philosophy-grid",
          start: "top 86%",
          once: true,
        },
      });

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  const handleLaunchConcierge = (e: React.FormEvent) => {
    e.preventDefault();
    openConciergeWithPrompt(
      promptDraft.trim() || CONCIERGE_QUICK_PROMPTS[0]
    );
  };

  return (
    <section
      ref={sectionRef}
      className="relative py-24 sm:py-32 px-4 sm:px-8 border-t border-brass/15 bg-obsidian overflow-x-clip"
    >
      <div className="max-w-7xl mx-auto">
        {/* Section Eyebrow & Editorial Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-10 border-b border-brass/20">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-brass">
              Private Hospitality &amp; Craft
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-5xl text-cream tracking-[0.06em] uppercase leading-[1.04]">
              Zero-Proof{" "}
              <span className="font-serif italic font-normal normal-case tracking-normal text-brass">
                Cellar &amp; Table
              </span>
            </h2>
          </div>

          <p className="max-w-md font-sans text-sm text-sand/85 font-light leading-relaxed">
            Guided by Executive Chef allergen protocols, serene terrace acoustics, and real-time
            Banani rooftop seating availability.
          </p>
        </div>

        {/* Scene 4: Split-Curtain Parallax Stage */}
        <div
          ref={splitStageRef}
          className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
        >
          {/* Left Curtain Plane: Chef Tariq Portrait */}
          <div
            ref={leftCurtainRef}
            className="lg:col-span-4 relative z-20 border border-brass/25 bg-charcoal overflow-hidden flex flex-col justify-between min-h-[320px] sm:min-h-[360px] lg:min-h-[450px]"
          >
            <img
              src="/media/chef-concierge.jpg"
              alt="Executive Chef Tariq Al-Mahmud at Nocturne Dhaka"
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/25 to-obsidian/35" />

            <div className="relative z-10 p-5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass bg-obsidian/80 border border-brass/30 px-2.5 py-1">
                Kitchen &amp; Cellar
              </span>
              <span className="font-mono text-[10px] text-sand/85 bg-obsidian/80 border border-brass/20 px-2.5 py-1">
                Est. 2026
              </span>
            </div>

            <div className="relative z-10 p-5 border-t border-brass/20 bg-obsidian/80 backdrop-blur-md">
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
                Chef Tariq Al-Mahmud
              </div>
              <div className="font-serif italic text-2xl text-cream mt-0.5">
                Crafted Over White-Oak Embers
              </div>
            </div>
          </div>

          {/* Center Obsidian Reveal: Live LangChain Culinary Concierge Prompt Launcher */}
          <div
            ref={centerRevealRef}
            className="lg:col-span-4 relative z-10 border border-brass/45 bg-charcoal/70 backdrop-blur-md p-6 sm:p-7 flex flex-col justify-between min-h-[320px] sm:min-h-[360px] lg:min-h-[450px]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-brass/20">
                <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-brass">
                  <Sparkles className="w-3.5 h-3.5" />
                  Maître d&apos; Desk
                </span>
                <span className="font-mono text-[10px] text-cream/70 border border-brass/25 px-2 py-0.5">
                  Ctrl + J
                </span>
              </div>

              <h3 className="mt-5 font-display text-2xl text-cream tracking-[0.04em] leading-snug">
                Ask Our{" "}
                <span className="font-serif italic font-normal text-brass text-3xl">
                  Sommelier
                </span>
              </h3>
              <p className="mt-2 font-sans text-xs text-sand/85 leading-relaxed font-light">
                Live seating availability, dedicated allergen preparation notes, and zero-proof
                pairing suggestions within your evening budget.
              </p>

              {/* Curated One-Click Prompt Triggers */}
              <div className="mt-5 space-y-2">
                <div className="font-syne text-[10px] uppercase tracking-[0.22em] text-sand/70">
                  Instant Briefings
                </div>
                {CONCIERGE_QUICK_PROMPTS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => openConciergeWithPrompt(sample)}
                    className="w-full text-left px-3 py-2 border border-brass/20 bg-obsidian/75 hover:border-brass hover:bg-obsidian text-xs font-sans text-cream/90 transition-colors flex items-center justify-between gap-2 group"
                  >
                    <span className="line-clamp-1">{sample}</span>
                    <ArrowRight className="w-3 h-3 text-brass shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>

            {/* Live Prompt Bar */}
            <form onSubmit={handleLaunchConcierge} className="mt-6 pt-4 border-t border-brass/20">
              <div className="flex items-stretch border border-brass/35 bg-obsidian focus-within:border-brass transition-colors">
                <input
                  type="text"
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  placeholder="Ask about quiet seats or Wagyu allergens..."
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-xs font-sans text-cream placeholder:text-sand/50 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 bg-brass hover:bg-brass-soft text-obsidian font-syne text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <span>Ask</span>
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </form>
          </div>

          {/* Right Curtain Plane: Live Interactive Miniature 2D Floorplan Preview */}
          <div
            ref={rightCurtainRef}
            className="lg:col-span-4 relative z-20 border border-brass/25 bg-charcoal p-5 flex flex-col justify-between min-h-[320px] sm:min-h-[360px] lg:min-h-[450px]"
          >
            <div className="flex items-center justify-between border-b border-brass/20 pb-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
                  Live Blueprint Preview
                </div>
                <div className="font-display text-sm uppercase tracking-[0.12em] text-cream mt-0.5">
                  18 Architectural Tables
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-sage animate-pulse" title="Live Availability" />
            </div>

            {/* Miniature 2D SVG Architectural Blueprint */}
            <div className="my-4 relative border border-brass/15 bg-obsidian p-2">
              <svg
                viewBox="0 0 420 280"
                className="w-full h-auto"
                role="img"
                aria-label="Miniature architectural 2D floorplan of Nocturne dining zones"
              >
                <defs>
                  <pattern
                    id="mini-blueprint-grid"
                    width="24"
                    height="24"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 24 0 L 0 0 0 24"
                      fill="none"
                      stroke="rgba(212,175,55,0.08)"
                      strokeWidth="0.7"
                    />
                  </pattern>
                </defs>
                <rect width="420" height="280" fill="url(#mini-blueprint-grid)" />

                {/* Zone Bounding Outlines */}
                <rect
                  x="22"
                  y="24"
                  width="124"
                  height="232"
                  fill="rgba(212,175,55,0.03)"
                  stroke="rgba(212,175,55,0.28)"
                  strokeDasharray="4 4"
                />
                <text
                  x="32"
                  y="42"
                  fill="#D4AF37"
                  fontSize="8"
                  fontFamily="monospace"
                  letterSpacing="1.6"
                >
                  ROOFTOP 52dB
                </text>

                <rect
                  x="156"
                  y="24"
                  width="138"
                  height="232"
                  fill="rgba(200,90,50,0.04)"
                  stroke="rgba(212,175,55,0.22)"
                />
                <text
                  x="166"
                  y="42"
                  fill="#A39B93"
                  fontSize="8"
                  fontFamily="monospace"
                  letterSpacing="1.4"
                >
                  GLASS KITCHEN
                </text>

                <rect
                  x="304"
                  y="24"
                  width="94"
                  height="232"
                  fill="rgba(74,107,83,0.06)"
                  stroke="rgba(74,107,83,0.45)"
                />
                <text
                  x="312"
                  y="42"
                  fill="#7FA68B"
                  fontSize="8"
                  fontFamily="monospace"
                  letterSpacing="1.4"
                >
                  LOUNGE 46dB
                </text>

                {/* Clickable Miniature Table Nodes */}
                {MINI_TABLES.map((tbl, idx) => (
                  <Link
                    key={tbl.code}
                    href={`/reserve?zone=${encodeURIComponent(tbl.zone)}`}
                    className="group"
                  >
                    <g className="cursor-pointer">
                      <circle
                        cx={tbl.x}
                        cy={tbl.y}
                        r={idx % 4 === 0 ? 15 : 13}
                        fill={idx % 3 === 0 ? "rgba(74,107,83,0.25)" : "rgba(212,175,55,0.12)"}
                        stroke={idx % 3 === 0 ? "#7FA68B" : "#D4AF37"}
                        strokeWidth="1.2"
                      />
                      <text
                        x={tbl.x}
                        y={tbl.y + 3}
                        textAnchor="middle"
                        fill="#F4EFE6"
                        fontSize="7.5"
                        fontFamily="monospace"
                      >
                        {tbl.code}
                      </text>
                    </g>
                  </Link>
                ))}
              </svg>
            </div>

            <div className="pt-3 border-t border-brass/20 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] text-sand/80">
                Redis Two-Phase Lock • 600s
              </span>
              <Link
                href="/reserve"
                data-cursor="RESERVE"
                className="inline-flex items-center gap-2 font-syne text-[10px] font-bold uppercase tracking-[0.2em] text-brass hover:text-cream transition-colors"
              >
                <span>Open Seat-Picker</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom 3-Cell Nocturne Culinary Manifesto */}
        <div className="philosophy-grid mt-10 grid grid-cols-1 md:grid-cols-3 border border-brass/20 divide-y md:divide-y-0 md:divide-x divide-brass/20 bg-charcoal/40">
          {PHILOSOPHY_PILLARS.map(({ icon: Icon, title, detail }) => (
            <div
              key={title}
              className="philosophy-cell p-6 flex items-start gap-4"
            >
              <div className="w-9 h-9 border border-brass/35 bg-obsidian flex items-center justify-center text-brass shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display text-sm uppercase tracking-[0.1em] text-cream">
                  {title}
                </h3>
                <p className="mt-1.5 font-sans text-xs text-sand/80 leading-relaxed font-light">
                  {detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
