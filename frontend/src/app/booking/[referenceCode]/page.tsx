"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  checkInReservation,
  fetchPaymentConfig,
  fetchReservation,
  formatBdt,
  initEarlyPayment,
  verifyEarlyPayment,
} from "@/lib/api";
import { FALLBACK_BOOKING } from "@/lib/fallback-data";
import {
  PaymentConfigOut,
  PaymentGateway,
  ReservationOut,
} from "@/types/nocturne";

function QrPassSvg({ value }: { value: string }) {
  // Deterministic 21x21 QR-style matrix derived from booking payload
  const size = 21;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const cells: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (__, c) => {
      const inTopLeft = r < 7 && c < 7;
      const inTopRight = r < 7 && c >= size - 7;
      const inBottomLeft = r >= size - 7 && c < 7;
      if (inTopLeft || inTopRight || inBottomLeft) {
        const lr = inBottomLeft ? r - (size - 7) : r;
        const lc = inTopRight ? c - (size - 7) : c;
        if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
        if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
        return false;
      }
      const bitSeed = (hash ^ (r * 37 + c * 91 + (r ^ c) * 13)) >>> 0;
      return (bitSeed & 3) !== 0 && ((r + c) % 5 !== 0 || (bitSeed & 1) === 1);
    })
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-36 h-36 bg-cream p-2.5 rounded-xl"
      role="img"
      aria-label={`Boarding pass QR code for ${value}`}
    >
      {cells.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c}
              y={r}
              width={1}
              height={1}
              fill="#0E0D0C"
            />
          ) : null
        )
      )}
    </svg>
  );
}

function BookingPassContent({
  referenceCode,
}: {
  referenceCode: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [booking, setBooking] = useState<ReservationOut | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [payingGateway, setPayingGateway] = useState<PaymentGateway | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const processedCallbackRef = useRef<string | null>(null);

  const demoCheckout = searchParams.get("demo_checkout") === "1";
  const gatewayParam = searchParams.get("gateway");
  const demoGateway: PaymentGateway | null =
    gatewayParam === "bkash" || gatewayParam === "card" ? gatewayParam : null;
  const demoPaymentId = searchParams.get("payment_id");
  const bkashPaymentId = searchParams.get("paymentID");
  const cardSessionId = searchParams.get("session_id");
  const statusParam = searchParams.get("status");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetchReservation(referenceCode);
        if (active) {
          setBooking(res);
          setError(null);
        }
      } catch (err) {
        if (active) {
          if (referenceCode.toUpperCase() === "NOC-2026-9941") {
            setBooking(FALLBACK_BOOKING);
          } else {
            setError(
              err instanceof Error
                ? err.message
                : `Reservation ${referenceCode} not found.`
            );
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    fetchPaymentConfig()
      .then((cfg) => {
        if (active) setPaymentConfig(cfg);
      })
      .catch(() => {
        // Optional gateway metadata
      });
    return () => {
      active = false;
    };
  }, [referenceCode]);

  useEffect(() => {
    if (demoCheckout) return;

    // Handle live gateway redirects:
    // - bKash Tokenized Checkout returns ?paymentID=...&status=...
    // - Stripe Card Checkout returns ?gateway=card&session_id=... or ?gateway=card&status=cancel
    let gatewayToVerify: PaymentGateway | null = null;
    let paymentIdToVerify: string | null = null;
    let callbackStatus: string | null = statusParam;

    if (bkashPaymentId) {
      gatewayToVerify = "bkash";
      paymentIdToVerify = bkashPaymentId;
    } else if (demoGateway === "card" && (cardSessionId || statusParam)) {
      gatewayToVerify = "card";
      paymentIdToVerify = cardSessionId || "cancelled";
      if (!callbackStatus) callbackStatus = "success";
    }

    if (!gatewayToVerify || !paymentIdToVerify) return;

    const dedupeKey = `${gatewayToVerify}:${paymentIdToVerify}:${callbackStatus ?? ""}`;
    if (processedCallbackRef.current === dedupeKey) return;
    processedCallbackRef.current = dedupeKey;

    let active = true;
    setVerifyingPayment(true);
    setPaymentError(null);

    verifyEarlyPayment({
      reference_code: referenceCode,
      gateway: gatewayToVerify,
      payment_id: paymentIdToVerify,
      status: callbackStatus,
    })
      .then((result) => {
        if (!active) return;
        if (result.reservation) {
          setBooking(result.reservation);
        }
        if (result.payment_status === "PAID") {
          setPaymentNotice(result.message);
        } else {
          setPaymentError(result.message);
        }
        router.replace(`/booking/${referenceCode}`);
      })
      .catch((err) => {
        if (!active) return;
        setPaymentError(
          err instanceof Error
            ? err.message
            : "Unable to verify early settlement with payment gateway."
        );
      })
      .finally(() => {
        if (active) setVerifyingPayment(false);
      });

    return () => {
      active = false;
    };
  }, [
    bkashPaymentId,
    cardSessionId,
    demoCheckout,
    demoGateway,
    referenceCode,
    router,
    statusParam,
  ]);

  const handleStartEarlyPayment = async (gateway: PaymentGateway) => {
    if (!booking) return;
    setPayingGateway(gateway);
    setPaymentError(null);
    setPaymentNotice(null);
    try {
      const session = await initEarlyPayment({
        reference_code: booking.reference_code,
        gateway,
        return_origin: window.location.origin,
      });
      window.location.assign(session.checkout_url);
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? err.message
          : "Unable to initiate early settlement."
      );
      setPayingGateway(null);
    }
  };

  const handleSandboxSettlement = async (outcome: "success" | "cancel") => {
    if (!demoGateway || !demoPaymentId) return;
    setVerifyingPayment(true);
    setPaymentError(null);
    try {
      const result = await verifyEarlyPayment({
        reference_code: referenceCode,
        gateway: demoGateway,
        payment_id: demoPaymentId,
        status: outcome,
      });
      if (result.reservation) {
        setBooking(result.reservation);
      }
      if (result.payment_status === "PAID") {
        setPaymentNotice(result.message);
      } else {
        setPaymentError(result.message);
      }
      router.replace(`/booking/${referenceCode}`);
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Sandbox settlement failed."
      );
    } finally {
      setVerifyingPayment(false);
    }
  };

  const handleCheckInSimulator = async () => {
    if (!booking) return;
    setCheckingIn(true);
    try {
      const updated = await checkInReservation(booking.reference_code);
      setBooking(updated);
    } catch {
      // Allow local visual state transition only if API offline on seeded demo pass
      if (booking.reference_code === "NOC-2026-9941") {
        setBooking({
          ...booking,
          status: "SEATED",
          version: booking.version + 1,
        });
      }
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian pt-36 px-4 text-center font-mono text-sm text-brass">
        Retrieving Digital Boarding Pass {referenceCode}...
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-obsidian pt-36 pb-20 px-4 max-w-2xl mx-auto text-center space-y-5">
        <div className="font-mono text-xs uppercase tracking-[0.25em] text-ember">
          Pass Unavailable
        </div>
        <h1 className="font-serif text-4xl text-cream">
          Reservation {referenceCode} Not Found
        </h1>
        <p className="text-sm text-sand">{error}</p>
        <Link
          href="/reserve"
          data-cursor="RESERVE"
          className="inline-flex items-center gap-2 px-6 py-3 bg-brass text-obsidian font-syne text-xs font-bold uppercase tracking-[0.2em]"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Seat-Picker Studio
        </Link>
      </div>
    );
  }

  const qrPayload = `NOCTURNE|${booking.reference_code}|${booking.table_code}|${booking.reservation_date}|${booking.time_slot}`;
  const isSeated = booking.status === "SEATED";
  const isPaid = booking.payment_status === "PAID";
  const payableAmount = Number(
    booking.payable_amount_bdt ??
      (Number(booking.pre_order_total_bdt) > 0
        ? booking.pre_order_total_bdt
        : (paymentConfig?.table_deposit_bdt ?? 1000))
  );

  return (
    <div className="min-h-screen bg-obsidian pt-28 pb-24 px-4 sm:px-8 max-w-4xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/reserve"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-sand hover:text-brass transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Floorplan Studio
        </Link>

        <span className="font-mono text-xs text-sand/80">
          Host Podium Ticket &bull; v{booking.version}
        </span>
      </div>

      {/* Interactive Gateway Sandbox Sheet when gateway env credentials are not yet set */}
      {demoCheckout && demoGateway && demoPaymentId && !isPaid && (
        <div className="mb-6 border border-brass/50 bg-charcoal p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brass">
                {demoGateway === "bkash"
                  ? "bKash Tokenized Checkout Sandbox"
                  : "Card Checkout Sandbox"}
              </div>
              <h2 className="mt-1 font-serif text-2xl text-cream">
                Authorize Early Settlement ({formatBdt(payableAmount)})
              </h2>
            </div>
            <span className="font-mono text-[11px] text-sand border border-brass/25 px-3 py-1 bg-obsidian">
              Ref: {demoPaymentId}
            </span>
          </div>

          <p className="text-xs font-sans text-sand/90 leading-relaxed">
            Live {demoGateway === "bkash" ? "bKash merchant" : "Stripe"} API keys are not set in <code className="text-brass font-mono">.env</code> yet, so Nocturne opened its local checkout simulator so you can verify the end-to-end callback &amp; ledger flow cleanly.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={verifyingPayment}
              onClick={() => handleSandboxSettlement("success")}
              className="px-5 py-3 bg-brass hover:bg-brass-soft disabled:opacity-60 text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.2em] transition-colors"
            >
              {verifyingPayment
                ? "Verifying Settlement..."
                : "Authorize Sandbox Payment"}
            </button>
            <button
              type="button"
              disabled={verifyingPayment}
              onClick={() => handleSandboxSettlement("cancel")}
              className="px-4 py-3 border border-brass/30 text-sand hover:text-cream font-mono text-[11px] uppercase tracking-[0.16em] transition-colors"
            >
              Cancel Payment
            </button>
          </div>
        </div>
      )}

      {verifyingPayment && !demoCheckout && (
        <div className="mb-6 border border-brass/35 bg-charcoal p-4 font-mono text-xs text-brass">
          Executing gateway settlement verification for {referenceCode}...
        </div>
      )}

      {paymentNotice && (
        <div className="mb-6 border border-sage/50 bg-sage/10 p-4 flex items-start gap-2.5 text-xs text-cream">
          <CheckCircle2 className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <span>{paymentNotice}</span>
        </div>
      )}

      {paymentError && (
        <div className="mb-6 border border-ember/50 bg-ember/15 p-4 flex items-start gap-2.5 text-xs text-cream">
          <AlertTriangle className="w-4 h-4 text-ember shrink-0 mt-0.5" />
          <span>{paymentError}</span>
        </div>
      )}

      {/* Digital Boarding Pass Card with /media/pass-card-bg.jpg Texture */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden border border-brass/35 shadow-card bg-charcoal"
      >
        {/* Top Hero Texture Band */}
        <div className="relative p-6 sm:p-9 overflow-hidden border-b border-dashed border-brass/30">
          <img
            src="/media/pass-card-bg.jpg"
            alt="Nocturne metallic pass texture"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-obsidian/92 via-obsidian/80 to-charcoal/90" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-obsidian/85 border border-brass/40 font-mono text-[10px] uppercase tracking-[0.25em] text-brass">
                <Sparkles className="w-3 h-3" />
                Nocturne Dhaka &bull; Level 14 Penthouse
              </div>
              <h1 className="mt-4 font-display text-3xl sm:text-5xl uppercase tracking-[0.06em] text-cream leading-tight">
                {booking.guest_name}
              </h1>
              <p className="mt-1 font-mono text-sm text-sand tabular-nums">
                {booking.guest_phone}
                {booking.special_occasion ? ` • ${booking.special_occasion}` : ""}
              </p>
            </div>

            <div className="flex flex-col md:items-end gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-sand">
                Boarding Reference
              </span>
              <span className="font-mono text-2xl sm:text-3xl text-brass font-semibold tracking-wider tabular-nums">
                {booking.reference_code}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3.5 py-1 font-mono text-xs font-medium border ${
                  isSeated
                    ? "bg-brass/20 border-brass text-brass"
                    : "bg-sage/20 border-sage text-sage"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isSeated ? "SEATED · KITCHEN FIRED" : booking.status}
              </span>
              {isPaid && (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1 font-mono text-[11px] font-medium border bg-brass/15 border-brass/60 text-brass">
                  PAID IN ADVANCE &middot; {booking.payment_method || "EARLY"}
                </span>
              )}
              {isPaid && booking.payment_reference && (
                <span className="font-mono text-[10px] text-sand/80">
                  Tx: {booking.payment_reference} ({formatBdt(booking.paid_amount_bdt ?? payableAmount)})
                </span>
              )}
            </div>
          </div>

          {/* Perforated Architectural Flight Grid */}
          <div className="relative z-10 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-brass/20">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sand flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-brass" />
                Seat &amp; Wing
              </div>
              <div className="mt-1 font-mono text-xl text-cream font-semibold">
                {booking.table_code}
              </div>
              <div className="text-xs text-sand">{booking.zone_name}</div>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sand flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-brass" />
                Date
              </div>
              <div className="mt-1 font-mono text-lg text-cream tabular-nums">
                {booking.reservation_date}
              </div>
              <div className="text-xs text-sand">15-Min Grace Held</div>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sand flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-brass" />
                Seating Window
              </div>
              <div className="mt-1 font-mono text-xl text-cream tabular-nums">
                {booking.time_slot}
              </div>
              <div className="text-xs text-sand">Retractable Canopy Deck</div>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sand flex items-center gap-1.5">
                <Users className="w-3 h-3 text-brass" />
                Party Size
              </div>
              <div className="mt-1 font-mono text-xl text-cream tabular-nums">
                {booking.party_size} Guests
              </div>
              <div className="text-xs text-sand">Smart Evening Attire</div>
            </div>
          </div>
        </div>

        {/* Lower Section: Pre-Order Courses & QR Scanner */}
        <div className="p-6 sm:p-9 grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-charcoal">
          <div className="md:col-span-8 space-y-4">
            <div className="flex items-center justify-between border-b border-brass/15 pb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-brass" />
                <h2 className="font-serif text-2xl text-cream">
                  Pre-Ordered Culinary Manifest
                </h2>
              </div>
              <span className="font-mono text-sm text-brass tabular-nums font-medium">
                {formatBdt(booking.pre_order_total_bdt)}
              </span>
            </div>

            {booking.items.length === 0 ? (
              <p className="text-sm text-sand font-light">
                Table-only reservation confirmed. Order courses upon arrival with your sommelier.
              </p>
            ) : (
              <div className="space-y-3">
                {booking.items.map((item) => {
                  const portion =
                    typeof item.selected_modifiers?.portion === "string"
                      ? item.selected_modifiers.portion
                      : null;
                  const spice =
                    typeof item.selected_modifiers?.spice === "string"
                      ? item.selected_modifiers.spice
                      : null;
                  const sides = Array.isArray(item.selected_modifiers?.sides)
                    ? (item.selected_modifiers.sides as string[])
                    : [];

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 rounded-2xl bg-obsidian/70 border border-brass/15 p-3.5"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-obsidian ring-1 ring-brass/30 shrink-0">
                          <img
                            src={item.image_url}
                            alt={item.dish_name}
                            className="w-full h-full object-cover mix-blend-lighten"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-cream text-sm truncate">
                            {item.quantity} × {item.dish_name}
                          </div>
                          <div className="font-mono text-[11px] text-sand/85 mt-0.5">
                            {[portion, spice, ...sides].filter(Boolean).join(" · ") ||
                              "Chef Standard"}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-sm text-cream tabular-nums shrink-0">
                        {formatBdt(Number(item.unit_price_bdt) * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right QR Pass & 1-Click Host Check-In Simulator */}
          <div className="md:col-span-4 flex flex-col items-center justify-center bg-obsidian p-6 border border-brass/25 text-center space-y-4">
            <QrPassSvg value={qrPayload} />

            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-brass">
                Banani Host Podium Scan
              </div>
              <div className="font-mono text-xs text-sand tabular-nums">
                {booking.reference_code}
              </div>
            </div>

            <button
              type="button"
              disabled={isSeated || checkingIn}
              onClick={handleCheckInSimulator}
              data-cursor="RESERVE"
              className="w-full py-3.5 px-4 bg-brass hover:bg-brass-soft disabled:bg-sage/20 disabled:text-sage disabled:border disabled:border-sage/40 text-obsidian font-syne text-[11px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isSeated
                  ? "Checked In · Courses Fired"
                  : checkingIn
                    ? "Firing Kitchen..."
                    : "Simulate Host Check-In"}
              </span>
            </button>
          </div>
        </div>

        {/* Early Settlement Bar */}
        <div className="border-t border-brass/25 bg-obsidian/90 px-6 sm:px-9 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {isPaid ? (
            <>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-sage">
                  Advance Settlement Verified
                </div>
                <div className="mt-1 text-xs font-sans text-sand">
                  Settled {formatBdt(booking.paid_amount_bdt ?? payableAmount)} via{" "}
                  <span className="text-cream font-medium">{booking.payment_method || "Gateway"}</span>
                  {booking.payment_reference ? ` · Ref ${booking.payment_reference}` : ""}
                </div>
              </div>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-sage border border-sage/40 bg-sage/10 px-4 py-2">
                <CheckCircle2 className="w-4 h-4" />
                Settled Prior to Arrival
              </span>
            </>
          ) : (
            <>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-brass">
                  Early Settlement Before Arrival
                </div>
                <div className="mt-1 text-xs font-sans text-sand">
                  {Number(booking.pre_order_total_bdt) > 0
                    ? `Full pre-order settlement (${formatBdt(payableAmount)}) for priority fire on arrival.`
                    : `Optional refundable penthouse table deposit (${formatBdt(payableAmount)}), credited to your bill.`}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={payingGateway !== null || verifyingPayment}
                  onClick={() => handleStartEarlyPayment("bkash")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-brass hover:bg-brass-soft disabled:opacity-60 text-obsidian font-syne text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>
                    {payingGateway === "bkash"
                      ? "Connecting bKash..."
                      : `Pre-Pay with bKash (${formatBdt(payableAmount)})`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={payingGateway !== null || verifyingPayment}
                  onClick={() => handleStartEarlyPayment("card")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-brass/45 hover:border-brass disabled:opacity-60 text-cream font-syne text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5 text-brass" />
                  <span>
                    {payingGateway === "card"
                      ? "Opening Card..."
                      : "Pre-Pay by Card"}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function BookingPassPage({
  params,
}: {
  params: Promise<{ referenceCode: string }>;
}) {
  const { referenceCode } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-obsidian pt-36 px-4 text-center font-mono text-sm text-brass">
          Retrieving Digital Boarding Pass {referenceCode}...
        </div>
      }
    >
      <BookingPassContent referenceCode={referenceCode} />
    </Suspense>
  );
}
