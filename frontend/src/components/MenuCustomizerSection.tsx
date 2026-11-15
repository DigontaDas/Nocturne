"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Compass,
  LayoutGrid,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  confirmReservation,
  fetchPaymentConfig,
  formatBdt,
  getOrCreateSessionId,
  initEarlyPayment,
} from "@/lib/api";
import { getDishImageClass } from "@/lib/dish-media";
import {
  createDefaultTrayItem,
  evaluateTrayAllergens,
} from "@/lib/tasting-logic";
import { useReservationContext } from "@/context/ReservationContext";
import { PlanetaryDishWheel } from "@/components/PlanetaryDishWheel";
import {
  TastingBudgetPlanner,
  TastingLedgerGrid,
} from "@/components/TastingStudioTools";
import { MenuItem, PaymentConfigOut, PaymentMethod } from "@/types/nocturne";

interface MenuCustomizerSectionProps {
  menuItems: MenuItem[];
  initialDishSlug?: string;
  standalone?: boolean;
}

export function MenuCustomizerSection({
  menuItems,
  initialDishSlug,
  standalone = false,
}: MenuCustomizerSectionProps) {
  const router = useRouter();
  const {
    selectedDate,
    selectedSlot,
    partySize,
    heldTable,
    setHeldTable,
    trayItems,
    addTrayItem,
    updateTrayQuantity,
    removeTrayItem,
    clearTray,
    setConciergeOpen,
  } = useReservationContext();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dairyFreeOnly, setDairyFreeOnly] = useState<boolean>(false);
  const [nutFreeOnly, setNutFreeOnly] = useState<boolean>(false);
  const [glutenFreeOnly, setGlutenFreeOnly] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"wheel" | "matrix">("wheel");
  const [focusedDishSlug, setFocusedDishSlug] = useState<string | undefined>(
    initialDishSlug
  );

  const [guestName, setGuestName] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("+8801711000000");
  const [specialOccasion, setSpecialOccasion] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PAY_AT_VENUE");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigOut | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPaymentConfig()
      .then((cfg) => {
        if (active) setPaymentConfig(cfg);
      })
      .catch(() => {
        // Optional payment capability probe; defaults remain usable
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (dairyFreeOnly && !item.is_dairy_free) return false;
      if (nutFreeOnly && !item.is_nut_free) return false;
      if (glutenFreeOnly && !item.is_gluten_free) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [menuItems, searchQuery, dairyFreeOnly, nutFreeOnly, glutenFreeOnly]);

  const traySubtotalBdt = trayItems.reduce(
    (sum, item) => sum + item.unitPriceBdt * item.quantity,
    0
  );
  const totalKcal = trayItems.reduce(
    (sum, item) => sum + item.caloriesKcal * item.quantity,
    0
  );
  const totalProtein = trayItems.reduce(
    (sum, item) => sum + item.proteinGrams * item.quantity,
    0
  );
  const earlyPayAmountBdt =
    traySubtotalBdt > 0
      ? traySubtotalBdt
      : (paymentConfig?.table_deposit_bdt ?? 1000);
  const trayAudit = evaluateTrayAllergens(trayItems);
  const suggestedMocktail = useMemo(
    () =>
      menuItems.find((m) => m.slug === "smoked-hibiscus-mocktail") ||
      menuItems.find((m) => m.category === "Botanical Mocktails") ||
      null,
    [menuItems]
  );

  const handleInspectOnWheel = (slug: string) => {
    setFocusedDishSlug(slug);
    setViewMode("wheel");
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError(null);
    if (!heldTable) {
      setConfirmError(
        standalone
          ? "Hold an architectural seat on the 2D Floorplan Studio before issuing a boarding pass."
          : "Hold a table on the 2D floorplan above before confirming."
      );
      return;
    }
    if (guestName.trim().length < 2) {
      setConfirmError("Please enter the primary guest's full name.");
      return;
    }
    if (guestPhone.trim().length < 6) {
      setConfirmError("Please enter a valid contact phone number.");
      return;
    }

    setSubmitting(true);
    try {
      const sessionId = getOrCreateSessionId();
      const ticket = await confirmReservation({
        table_code: heldTable.tableCode,
        reservation_date: heldTable.reservationDate || selectedDate,
        time_slot: heldTable.timeSlot || selectedSlot,
        session_id: sessionId,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        party_size: partySize,
        special_occasion: specialOccasion.trim() || null,
        payment_method: paymentMethod,
        items: trayItems.map((item) => ({
          menu_item_id: item.menuItem.id,
          quantity: item.quantity,
          selected_modifiers: item.selectedModifiers,
        })),
      });
      setHeldTable(null);
      clearTray();

      if (paymentMethod === "BKASH" || paymentMethod === "CARD") {
        try {
          const gateway = paymentMethod === "BKASH" ? "bkash" : "card";
          const session = await initEarlyPayment({
            reference_code: ticket.reference_code,
            gateway,
            return_origin: window.location.origin,
          });
          window.location.assign(session.checkout_url);
          return;
        } catch {
          router.push(`/booking/${ticket.reference_code}?pay_prompt=1`);
          return;
        }
      }

      router.push(`/booking/${ticket.reference_code}`);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "";
      const isValidationOrConflict =
        /(?:already|hold|409|400|422|expired|invalid|phone|name)/i.test(rawMsg);
      setConfirmError(
        isValidationOrConflict
          ? rawMsg
          : "Unable to finalize your reservation right now. Please try again in a moment."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="menu"
      data-scroll-section
      data-scroll-label={standalone ? "Tasting Studio" : "Tasting Menu"}
      className="relative pt-14 pb-16 border-t border-brass/20 overflow-x-clip"
    >
      {/* Dietary Safety, Search & View Switcher Strip */}
      <div className="mb-8 flex flex-col xl:flex-row xl:items-center justify-between gap-4 border border-brass/25 bg-charcoal/55 p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-brass absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter wheel by dish, wagyu, truffle, hibiscus..."
            className="w-full pl-10 pr-4 py-2.5 bg-obsidian border border-brass/25 text-xs font-sans text-cream placeholder:text-sand/55 focus:outline-none focus:border-brass transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-sand/75 mr-1">
              Allergen Matrix:
            </span>
            {[
              {
                label: "Dairy-Free",
                active: dairyFreeOnly,
                toggle: () => setDairyFreeOnly((v) => !v),
              },
              {
                label: "Nut-Free",
                active: nutFreeOnly,
                toggle: () => setNutFreeOnly((v) => !v),
              },
              {
                label: "Gluten-Free",
                active: glutenFreeOnly,
                toggle: () => setGlutenFreeOnly((v) => !v),
              },
            ].map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.toggle}
                className={`inline-flex items-center gap-1.5 px-3 py-2 border font-syne text-[10px] uppercase tracking-[0.18em] transition-colors ${
                  filter.active
                    ? "bg-sage/20 border-sage text-cream"
                    : "bg-obsidian border-brass/25 text-sand hover:border-brass hover:text-cream"
                }`}
              >
                <ShieldCheck className="w-3 h-3 text-sage" />
                <span>{filter.label}</span>
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Menu view mode"
            className="inline-flex border border-brass/30 bg-obsidian p-0.5"
          >
            <button
              type="button"
              onClick={() => setViewMode("wheel")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-[10px] uppercase tracking-[0.16em] transition-colors ${
                viewMode === "wheel"
                  ? "bg-brass text-obsidian font-semibold"
                  : "text-sand hover:text-cream"
              }`}
            >
              <Compass className="w-3 h-3" />
              <span>Wheel</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("matrix")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-[10px] uppercase tracking-[0.16em] transition-colors ${
                viewMode === "matrix"
                  ? "bg-brass text-obsidian font-semibold"
                  : "text-sand hover:text-cream"
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>Course Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Algorithmic Budget & Dietary Flight Planner */}
      <TastingBudgetPlanner
        menuItems={menuItems}
        dairyFreeOnly={dairyFreeOnly}
        nutFreeOnly={nutFreeOnly}
        glutenFreeOnly={glutenFreeOnly}
        onInspectDish={handleInspectOnWheel}
      />

      {/* Full-Width Tasting Wheel OR Architectural Course Ledger */}
      <div className="space-y-8">
        <div className="border border-brass/20 bg-obsidian">
          {filteredMenu.length > 0 ? (
            viewMode === "wheel" ? (
              <PlanetaryDishWheel
                dishes={filteredMenu}
                fullCatalog={menuItems}
                mode="interactive"
                initialDishSlug={focusedDishSlug}
                sectionLabel={
                  standalone
                    ? "Seasonal Tasting Menu"
                    : "Pre-Order Tasting Menu"
                }
                titlePrefix="Compose"
                titleItalic="Sequence"
              />
            ) : (
              <TastingLedgerGrid
                dishes={filteredMenu}
                onInspectOnWheel={handleInspectOnWheel}
              />
            )
          ) : (
            <div className="py-24 px-8 text-center space-y-4">
              <p className="font-serif italic text-2xl text-cream">
                No courses match all active allergen filters simultaneously.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDairyFreeOnly(false);
                  setNutFreeOnly(false);
                  setGlutenFreeOnly(false);
                }}
                className="px-5 py-2.5 border border-brass text-brass hover:bg-brass hover:text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.2em] transition-colors"
              >
                Reset Allergen Filters
              </button>
            </div>
          )}
        </div>

        {/* Architectural Pre-Order Tray & Pass Issuance */}
        <aside
          id="tray-checkout"
          data-scroll-section
          data-scroll-label="Reservation Tray"
          className="border border-brass/30 bg-charcoal/90 backdrop-blur-md p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          <div className="lg:col-span-6 space-y-5">
            <div className="flex items-center justify-between border-b border-brass/20 pb-4">
              <h3 className="font-display text-lg uppercase tracking-[0.14em] text-cream">
                Pre-Order Tray
              </h3>
              <span className="font-sans text-[11px] font-medium px-2.5 py-1 bg-obsidian border border-brass/30 text-brass tabular-nums">
                {trayItems.reduce((acc, i) => acc + i.quantity, 0)} Items
              </span>
            </div>

            {/* Tray Items */}
            {trayItems.length === 0 ? (
              <div className="border border-dashed border-brass/30 bg-obsidian/45 p-6 text-center space-y-3">
                <p className="font-sans text-xs text-sand/85 font-light leading-relaxed">
                  Dial or swipe the tasting wheel above to inspect a dish, customize portions &amp;
                  spice, or consult our Sommelier for 1-click pairings.
                </p>
                <button
                  type="button"
                  onClick={() => setConciergeOpen(true)}
                  className="inline-flex items-center font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-brass hover:text-cream transition-colors"
                >
                  Consult Sommelier Concierge
                </button>
              </div>
            ) : (
              <div
                data-lenis-prevent
                data-lenis-prevent-wheel
                data-lenis-prevent-touch
                className="space-y-3 max-h-72 overflow-y-auto overscroll-contain pr-1"
              >
                {trayItems.map((item) => (
                  <div
                    key={item.key}
                    className="bg-obsidian border border-brass/20 p-3.5 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-obsidian ring-1 ring-brass/25 shrink-0">
                        <img
                          src={item.menuItem.image_url}
                          alt={item.menuItem.name}
                          className={getDishImageClass(item.menuItem.image_url, "mix-blend-lighten")}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-serif italic text-lg text-cream leading-tight truncate">
                          {item.menuItem.name}
                        </div>
                        <div className="font-mono text-[10px] text-sand/80 mt-0.5 truncate">
                          {[
                            item.selectedModifiers.portion,
                            item.selectedModifiers.spice,
                            ...(item.selectedModifiers.sides || []),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="font-mono text-xs text-brass mt-1 tabular-nums">
                          {formatBdt(item.unitPriceBdt * item.quantity)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateTrayQuantity(item.key, -1)}
                        className="w-6 h-6 bg-charcoal border border-brass/25 text-sand hover:text-cream hover:border-brass flex items-center justify-center transition-colors"
                        aria-label={`Decrease quantity of ${item.menuItem.name}`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs text-cream w-5 text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateTrayQuantity(item.key, 1)}
                        className="w-6 h-6 bg-charcoal border border-brass/25 text-sand hover:text-cream hover:border-brass flex items-center justify-center transition-colors"
                        aria-label={`Increase quantity of ${item.menuItem.name}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTrayItem(item.key)}
                        aria-label={`Remove ${item.menuItem.name}`}
                        className="ml-1 text-sand/70 hover:text-ember transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals, Course Progression Audit & Macros */}
            <div className="border-t border-brass/20 pt-4 space-y-3">
              {trayItems.length > 0 && (
                <div className="bg-obsidian/80 border border-brass/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider">
                    <span className="text-brass">Kitchen Pass Readiness</span>
                    <span className="text-sand/85 tabular-nums">
                      ~{trayAudit.peakPrepMins}m synchronized fire
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] uppercase">
                    <span
                      className={`px-2 py-0.5 border ${
                        trayAudit.allDairyFree
                          ? "border-sage/50 bg-sage/15 text-sage"
                          : "border-brass/20 text-sand/70"
                      }`}
                    >
                      {trayAudit.allDairyFree ? "Dairy-Free Sequence" : "Includes Dairy"}
                    </span>
                    <span
                      className={`px-2 py-0.5 border ${
                        trayAudit.allNutFree
                          ? "border-sage/50 bg-sage/15 text-sage"
                          : "border-brass/20 text-sand/70"
                      }`}
                    >
                      {trayAudit.allNutFree ? "Nut-Free Safe" : "Contains Nuts"}
                    </span>
                    <span
                      className={`px-2 py-0.5 border ${
                        trayAudit.allGlutenFree
                          ? "border-sage/50 bg-sage/15 text-sage"
                          : "border-brass/20 text-sand/70"
                      }`}
                    >
                      {trayAudit.allGlutenFree ? "Celiac Safe" : "Contains Gluten"}
                    </span>
                  </div>
                  {!trayAudit.hasMocktail && suggestedMocktail && (
                    <button
                      type="button"
                      onClick={() => addTrayItem(createDefaultTrayItem(suggestedMocktail))}
                      className="w-full mt-1 py-1.5 px-3 border border-brass/35 hover:border-brass bg-brass/10 hover:bg-brass hover:text-obsidian text-brass font-sans text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors text-center"
                    >
                      + Pair {suggestedMocktail.name} ({formatBdt(suggestedMocktail.base_price_bdt)})
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between font-sans text-xs text-sand">
                <span>Tray Nutrition</span>
                <span className="tabular-nums text-cream">
                  {totalKcal} kcal &bull; {totalProtein}g protein
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-sand">
                  Pre-Order Total
                </span>
                <span className="font-sans text-xl text-brass font-semibold tabular-nums">
                  {formatBdt(traySubtotalBdt)}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-5">
            {/* Seat Lock Banner */}
            <div className="bg-obsidian p-4 border border-brass/25">
              <div className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-sand">
                Selected Seat &amp; Window
              </div>
              {heldTable ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="font-sans text-xs text-cream tabular-nums">
                    <span className="text-brass font-semibold">{heldTable.tableCode}</span>{" "}
                    &bull; {heldTable.reservationDate} &bull; {heldTable.timeSlot}
                  </div>
                  <span className="font-sans text-[10px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 bg-sage/20 text-sage border border-sage/35">
                    Locked
                  </span>
                </div>
              ) : (
                <div className="mt-2 space-y-2.5">
                  <p className="font-sans text-xs text-ember font-normal leading-relaxed">
                    No active seat hold. Lock an open seat to bind your tasting sequence.
                  </p>
                  {standalone && (
                    <Link
                      href="/reserve"
                      data-cursor="RESERVE"
                      className="inline-flex items-center font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-brass hover:text-cream transition-colors"
                    >
                      <span>Open Floorplan Studio</span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Guest Details Form */}
            <form onSubmit={handleConfirmBooking} className="space-y-3.5">
              {confirmError && (
                <div className="bg-ember/15 border border-ember/50 p-3 text-xs font-sans text-cream flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-ember shrink-0 mt-0.5" />
                  <span>{confirmError}</span>
                </div>
              )}

              <div>
                <label className="block font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-sand mb-1.5">
                  Guest Full Name
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Tariq Hasan"
                  className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-xs font-sans text-cream placeholder:text-sand/50 focus:outline-none focus:border-brass transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-sand mb-1.5">
                    Mobile (+880)
                  </label>
                  <input
                    type="tel"
                    required
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+8801711223344"
                    className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 font-sans text-xs tabular-nums text-cream placeholder:text-sand/50 focus:outline-none focus:border-brass transition-colors"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-sand mb-1.5">
                    Occasion
                  </label>
                  <input
                    type="text"
                    value={specialOccasion}
                    onChange={(e) => setSpecialOccasion(e.target.value)}
                    placeholder="Anniversary, Birthday"
                    className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-xs font-sans text-cream placeholder:text-sand/50 focus:outline-none focus:border-brass transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-sand">
                    Settlement Timing
                  </label>
                  <span className="font-sans text-[11px] text-brass font-medium tabular-nums">
                    {paymentMethod === "PAY_AT_VENUE"
                      ? "Settle at Table"
                      : `${traySubtotalBdt > 0 ? "Pre-Order" : "Deposit"} ${formatBdt(earlyPayAmountBdt)}`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("PAY_AT_VENUE")}
                    className={`p-3 border text-left transition-colors ${
                      paymentMethod === "PAY_AT_VENUE"
                        ? "border-brass bg-brass/12 text-cream"
                        : "border-brass/20 bg-obsidian/70 text-sand hover:border-brass/45"
                    }`}
                  >
                    <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em]">
                      At Venue
                    </div>
                    <div className="font-sans text-[11px] text-sand/75 mt-1 font-light">
                      Pay on evening
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("BKASH")}
                    className={`p-3 border text-left transition-colors ${
                      paymentMethod === "BKASH"
                        ? "border-brass bg-brass/12 text-cream"
                        : "border-brass/20 bg-obsidian/70 text-sand hover:border-brass/45"
                    }`}
                  >
                    <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em]">
                      bKash
                    </div>
                    <div className="font-sans text-[11px] text-sand/75 mt-1 font-light">
                      {paymentConfig?.bkash.configured ? "bKash App" : "Test Checkout"}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("CARD")}
                    className={`p-3 border text-left transition-colors ${
                      paymentMethod === "CARD"
                        ? "border-brass bg-brass/12 text-cream"
                        : "border-brass/20 bg-obsidian/70 text-sand hover:border-brass/45"
                    }`}
                  >
                    <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em]">
                      Card
                    </div>
                    <div className="font-sans text-[11px] text-sand/75 mt-1 font-light">
                      {paymentConfig?.card.configured ? "Visa / Mastercard" : "Test Checkout"}
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                data-cursor="RESERVE"
                className="w-full py-3.5 px-5 bg-brass hover:bg-brass-soft disabled:opacity-60 text-obsidian font-sans text-xs font-semibold uppercase tracking-[0.18em] flex items-center justify-center transition-colors"
              >
                <span>
                  {submitting
                    ? "Confirming Lock & Issuing Pass..."
                    : paymentMethod === "BKASH"
                      ? `Confirm & Pay ${formatBdt(earlyPayAmountBdt)} via bKash`
                      : paymentMethod === "CARD"
                        ? `Confirm & Pay ${formatBdt(earlyPayAmountBdt)} by Card`
                        : "Confirm Reservation & Issue Pass"}
                </span>
              </button>
            </form>
          </div>
        </aside>
      </div>
    </section>
  );
}
