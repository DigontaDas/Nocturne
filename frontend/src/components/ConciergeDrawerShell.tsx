"use client";

import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  fetchConciergeStatus,
  formatBdt,
  getOrCreateSessionId,
  holdTable,
  releaseTableHold,
  streamConcierge,
} from "@/lib/api";
import { useReservationContext } from "@/context/ReservationContext";
import {
  ConciergeCardPayload,
  ConciergeCitation,
  ConciergeLlmStatus,
  ConciergeTrace,
} from "@/types/nocturne";

const SAMPLE_PROMPT =
  "Looking for a quiet table away from the kitchen for 2 tonight, plus a dairy-free main dish and mocktail pairing under ৳3,500";

function stripTrailingIncompleteMarkdown(raw: string): string {
  // Trim trailing unmatched ** or * while tokens are streaming so raw asterisks never flicker
  let clean = raw;
  const boldPairs = (clean.match(/\*\*/g) || []).length;
  if (boldPairs % 2 === 1) {
    const last = clean.lastIndexOf("**");
    if (last >= 0) clean = clean.slice(0, last) + clean.slice(last + 2);
  }
  const singleAsterisks = clean.replace(/\*\*/g, "").match(/\*/g)?.length || 0;
  if (singleAsterisks % 2 === 1) {
    const lastSingle = clean.lastIndexOf("*");
    if (lastSingle >= 0) clean = clean.slice(0, lastSingle) + clean.slice(lastSingle + 1);
  }
  return clean;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const normalized = stripTrailingIncompleteMarkdown(text);
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+§[^\]]+\])/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      parts.push(normalized.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={keyIdx++} className="font-semibold text-cream">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={keyIdx++} className="font-serif italic text-[15px] text-brass-soft">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 mx-0.5 bg-charcoal border border-brass/30 font-mono text-[11px] text-brass"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[") && token.endsWith("]")) {
      parts.push(
        <span
          key={keyIdx++}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 bg-brass/10 border border-brass/25 font-mono text-[10px] text-brass/95 whitespace-nowrap align-baseline"
        >
          {token.slice(1, -1)}
        </span>
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < normalized.length) {
    parts.push(normalized.slice(lastIndex));
  }

  return parts.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

function EditorialMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);

  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-sand/95 font-sans font-light">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-0.5" />;
        }

        // Heading syntax (### Title or standalone **Heading Line**)
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        const standaloneBoldHeading =
          !line.startsWith("-") &&
          !line.startsWith("*") &&
          line.startsWith("**") &&
          line.endsWith("**") &&
          line.indexOf("**", 2) === line.length - 2;

        if (headingMatch || standaloneBoldHeading) {
          const titleText = headingMatch
            ? headingMatch[1]
            : line.slice(2, -2);
          return (
            <div
              key={idx}
              className="pt-1.5 first:pt-0 pb-1 border-b border-brass/20 font-syne text-[11px] font-bold uppercase tracking-[0.16em] text-brass"
            >
              {renderInlineMarkdown(titleText)}
            </div>
          );
        }

        // Unordered or numbered list item
        const bulletMatch = line.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-0.5">
              <span className="mt-[7px] w-1.5 h-1.5 rotate-45 bg-brass shrink-0" />
              <div className="min-w-0 flex-1">{renderInlineMarkdown(bulletMatch[1])}</div>
            </div>
          );
        }

        return (
          <p key={idx} className="text-cream/90">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  traces?: ConciergeTrace[];
  citations?: ConciergeCitation[];
  cards?: ConciergeCardPayload | null;
  provider?: string;
}

export function ConciergeDrawerShell() {
  const router = useRouter();
  const {
    conciergeOpen,
    setConciergeOpen,
    selectedDate,
    selectedSlot,
    partySize,
    heldTable,
    setHeldTable,
    addTrayItem,
    pendingConciergePrompt,
    setPendingConciergePrompt,
  } = useReservationContext();

  const [input, setInput] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to Nocturne Dhaka. Ask me about live quiet acoustic tables, allergen-safe wood-fired dishes, or zero-proof mocktail pairings within your BDT budget.",
    },
  ]);
  const [showTraces, setShowTraces] = useState<boolean>(true);
  const [actionSuccessId, setActionSuccessId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<ConciergeLlmStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sendPromptRef = useRef<(promptText: string) => Promise<void>>(async () => {});

  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    // Scroll ONLY the inner chat viewport so outer document scroll position stays pinned
    el.scrollTop = el.scrollHeight;
  }, [messages, conciergeOpen]);

  useEffect(() => {
    if (!conciergeOpen) return;
    let active = true;
    fetchConciergeStatus()
      .then((res) => {
        if (active) setLlmStatus(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [conciergeOpen]);

  useEffect(() => {
    if (conciergeOpen && pendingConciergePrompt && !isStreaming) {
      const prompt = pendingConciergePrompt;
      setPendingConciergePrompt(null);
      void sendPromptRef.current(prompt);
    }
  }, [conciergeOpen, pendingConciergePrompt, isStreaming, setPendingConciergePrompt]);

  const sendPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (clean.length < 2 || isStreaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: clean,
    };
    const assistantId = `a-${Date.now() + 1}`;
    const emptyAssistant: ChatTurn = {
      id: assistantId,
      role: "assistant",
      content: "",
      traces: [],
      citations: [],
      cards: null,
    };

    setMessages((prev) => [...prev, userMsg, emptyAssistant]);
    setInput("");
    setIsStreaming(true);
    setActionError(null);

    const history = messages
      .filter((m) => m.id !== "welcome" && m.content.trim().length > 0)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await streamConcierge(
        {
          message: clean,
          reservation_date: selectedDate,
          time_slot: selectedSlot,
          party_size: partySize,
          session_id: getOrCreateSessionId(),
          history,
        },
        {
          onTrace: (trace) => {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const existing = m.traces || [];
                const idx = existing.findIndex((t) => t.id === trace.id);
                const nextTraces =
                  idx >= 0
                    ? existing.map((t, i) => (i === idx ? trace : t))
                    : [...existing, trace];
                return { ...m, traces: nextTraces };
              })
            );
          },
          onCitation: (citation) => {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const existing = m.citations || [];
                if (existing.some((c) => c.badge === citation.badge)) return m;
                return { ...m, citations: [...existing, citation] };
              })
            );
          },
          onToken: (text) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + text } : m
              )
            );
          },
          onCards: (cards) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, cards } : m))
            );
          },
          onDone: (meta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, provider: meta.provider } : m
              )
            );
          },
        },
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Unable to reach the FastAPI Concierge SSE stream right now. Verify the backend server is running on port 8000.",
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
    }
  };

  sendPromptRef.current = sendPrompt;

  const handleOneClickApply = async (turnId: string, cards: ConciergeCardPayload) => {
    setActionError(null);
    const sid = getOrCreateSessionId();

    try {
      if (cards.recommended_table) {
        if (heldTable && heldTable.tableCode !== cards.recommended_table.table_code) {
          await releaseTableHold({
            tableCode: heldTable.tableCode,
            reservationDate: heldTable.reservationDate,
            timeSlot: heldTable.timeSlot,
            sessionId: sid,
          }).catch(() => {});
        }
        const hold = await holdTable({
          tableCode: cards.recommended_table.table_code,
          reservationDate: cards.reservation_date || selectedDate,
          timeSlot: cards.time_slot || selectedSlot,
          sessionId: sid,
          partySize: cards.party_size || partySize,
        });
        setHeldTable({
          tableCode: hold.table_code,
          reservationDate: hold.reservation_date,
          timeSlot: hold.time_slot,
          expiresAt: hold.expires_at,
        });
      }

      for (const dish of cards.recommended_dishes) {
        const defaultPortion = dish.customization_schema?.portions?.[0]?.label;
        addTrayItem({
          key: `${dish.slug}::concierge-default`,
          menuItem: dish,
          quantity: 1,
          selectedModifiers: {
            portion: defaultPortion || "Chef Standard",
            sides: [],
          },
          unitPriceBdt: Number(dish.base_price_bdt) || 0,
          caloriesKcal: dish.calories_kcal,
          proteinGrams: dish.protein_grams,
          prepTimeMins: dish.prep_time_mins,
        });
      }

      setActionSuccessId(turnId);
      setTimeout(() => {
        setConciergeOpen(false);
        router.push("/reserve#menu");
      }, 650);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not lock recommended seat against backend API."
      );
    }
  };

  return (
    <AnimatePresence>
      {conciergeOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConciergeOpen(false)}
            data-lenis-prevent
            onWheelCapture={(e) => e.stopPropagation()}
            onTouchMoveCapture={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm touch-none"
          />

          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            data-lenis-prevent
            data-lenis-prevent-wheel
            data-lenis-prevent-touch
            onWheelCapture={(e) => e.stopPropagation()}
            onTouchMoveCapture={(e) => e.stopPropagation()}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg h-[100dvh] bg-charcoal border-l border-brass/30 flex flex-col justify-between shadow-card overscroll-contain"
          >
            {/* Header with Chef / Sommelier Portrait Avatar */}
            <div className="px-4 sm:px-6 py-4 border-b border-brass/15 bg-obsidian/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden ring-1 ring-brass/50 shrink-0">
                  <img
                    src="/media/chef-concierge.jpg"
                    alt="Nocturne Culinary Concierge"
                    className="w-full h-full object-cover object-top"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-sage ring-2 ring-obsidian" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-base sm:text-lg uppercase tracking-[0.12em] text-cream leading-none truncate">
                    Culinary Concierge
                  </h2>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-brass mt-1.5 truncate">
                    {llmStatus?.live_llm
                      ? `${llmStatus.provider} (${llmStatus.model})`
                      : "SQL + pgvector Hybrid RAG"}{" "}
                    &bull; {selectedSlot} ({partySize}P)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConciergeOpen(false)}
                aria-label="Close concierge drawer"
                className="p-2 border border-brass/30 text-sand hover:text-cream hover:border-brass transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Conversation Feed (strictly isolated from Lenis & window scroll) */}
            <div
              ref={scrollAreaRef}
              data-lenis-prevent
              data-lenis-prevent-wheel
              data-lenis-prevent-touch
              onWheelCapture={(e) => e.stopPropagation()}
              onTouchMoveCapture={(e) => e.stopPropagation()}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-5 space-y-5"
            >
              {/* Quick Prompt Suggestion */}
              {messages.length <= 1 && (
                <button
                  type="button"
                  onClick={() => void sendPrompt(SAMPLE_PROMPT)}
                  className="w-full text-left bg-obsidian/80 hover:bg-obsidian border border-brass/30 hover:border-brass p-4 transition-all group"
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-brass mb-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tap to Run Live SQL + pgvector Query</span>
                  </div>
                  <p className="text-xs font-sans text-cream/90 leading-relaxed font-light group-hover:text-cream">
                    &ldquo;{SAMPLE_PROMPT}&rdquo;
                  </p>
                </button>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] border border-brass bg-brass text-obsidian px-4 py-3 text-sm font-sans font-medium">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full space-y-3">
                      {/* Tool Execution Traces */}
                      {msg.traces && msg.traces.length > 0 && (
                        <div className="rounded-xl bg-obsidian/80 border border-brass/15 p-3">
                          <button
                            type="button"
                            onClick={() => setShowTraces((v) => !v)}
                            className="w-full flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-brass"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Cpu className="w-3.5 h-3.5" />
                              Live Tool Execution Traces ({msg.traces.length})
                            </span>
                            {showTraces ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {showTraces && (
                            <div className="mt-2.5 space-y-1.5">
                              {msg.traces.map((trace) => (
                                <div
                                  key={trace.id}
                                  className="flex items-start gap-2 text-[11px] font-mono"
                                >
                                  {trace.status === "running" ? (
                                    <Loader2 className="w-3.5 h-3.5 text-brass animate-spin shrink-0 mt-0.5" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-sage shrink-0 mt-0.5" />
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-cream">{trace.label}</span>
                                    <div className="text-sand/80 text-[10px] truncate">
                                      {trace.detail}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Formatted Editorial Markdown Response */}
                      <div className="rounded-2xl rounded-bl-sm bg-obsidian/92 border border-brass/25 px-4 py-3.5">
                        {msg.content ? (
                          <EditorialMarkdown content={msg.content} />
                        ) : (
                          <span className="inline-flex items-center gap-2 text-xs font-mono text-brass/80">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Consulting SQL tables &amp; chef notes...
                          </span>
                        )}
                      </div>

                      {/* Policy & Allergen Citation Pills */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cite) => (
                            <span
                              key={cite.badge}
                              title={cite.snippet}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-obsidian border border-brass/30 font-mono text-[10px] text-brass"
                            >
                              <FileText className="w-3 h-3" />
                              {cite.badge}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Generative UI Card: Recommended Table + Dishes + 1-Click Action */}
                      {msg.cards && (msg.cards.recommended_table || msg.cards.recommended_dishes.length > 0) && (
                        <div className="bg-obsidian border border-brass/40 p-4 space-y-3">
                          {msg.cards.recommended_table && (
                            <div className="flex items-center gap-3 pb-3 border-b border-brass/15">
                              <img
                                src={msg.cards.recommended_table.perspective_photo_url}
                                alt={msg.cards.recommended_table.table_code}
                                className="w-16 h-16 rounded-xl object-cover ring-1 ring-brass/30 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-xs font-semibold text-brass">
                                    Table {msg.cards.recommended_table.table_code}
                                  </span>
                                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-sage">
                                    <Volume2 className="w-3 h-3" />
                                    {msg.cards.recommended_table.noise_db} dB
                                  </span>
                                </div>
                                <div className="text-xs text-cream font-medium flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-brass" />
                                  {msg.cards.recommended_table.zone_name}
                                </div>
                                <p className="text-[11px] text-sand line-clamp-1 mt-0.5">
                                  {msg.cards.recommended_table.vibe_notes}
                                </p>
                              </div>
                            </div>
                          )}

                          {msg.cards.recommended_dishes.length > 0 && (
                            <div className="space-y-2">
                              {msg.cards.recommended_dishes.map((dish) => (
                                <div
                                  key={dish.id}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-obsidian ring-1 ring-brass/25 shrink-0">
                                      <img
                                        src={dish.image_url}
                                        alt={dish.name}
                                        className="w-full h-full object-cover mix-blend-lighten"
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-medium text-cream truncate">
                                        {dish.name}
                                      </div>
                                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-sand">
                                        <span>{dish.calories_kcal} kcal</span>
                                        {dish.is_dairy_free && (
                                          <span className="inline-flex items-center gap-0.5 text-sage">
                                            <ShieldCheck className="w-2.5 h-2.5" />
                                            DF
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="font-mono text-xs text-cream tabular-nums shrink-0">
                                    {formatBdt(dish.base_price_bdt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {actionError && (
                            <div className="text-[11px] font-mono text-ember">
                              {actionError}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              void handleOneClickApply(msg.id, msg.cards!)
                            }
                            data-cursor="RESERVE"
                            className="w-full py-3 px-4 bg-brass hover:bg-brass-soft text-obsidian font-syne text-[10px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {actionSuccessId === msg.id
                                ? "Held & Added! Opening Studio..."
                                : `${msg.cards.cta_label} (${formatBdt(msg.cards.pairing_total_bdt)})`}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom Prompt Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendPrompt(input);
              }}
              className="p-3.5 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-brass/20 bg-obsidian/90 shrink-0"
            >
              <div className="flex items-center gap-2 bg-charcoal border border-brass/30 focus-within:border-brass pl-4 pr-1.5 py-1.5">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about quiet seats, dairy-free dishes, BDT budget..."
                  className="flex-1 bg-transparent font-sans text-xs text-cream placeholder:text-sand/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isStreaming || input.trim().length < 2}
                  aria-label="Send message to concierge"
                  className="w-8 h-8 bg-brass hover:bg-brass-soft disabled:opacity-45 text-obsidian flex items-center justify-center transition-colors shrink-0"
                >
                  {isStreaming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
