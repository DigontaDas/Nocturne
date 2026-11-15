import {
  ConciergeCardPayload,
  ConciergeCitation,
  ConciergeLlmStatus,
  ConciergeTrace,
  DiningZone,
  MenuItem,
  PaymentConfigOut,
  PaymentGateway,
  PaymentInitResponse,
  PaymentMethod,
  PaymentVerifyResponse,
  ReservationLifecycleResponse,
  ReservationOut,
  RestaurantTable,
  TableHoldResponse,
} from "@/types/nocturne";

function resolveApiBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "http://localhost:8000";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(raw)) return `http://${raw}`;
  return `https://${raw}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function isLoopbackApiOnRemoteHost(): boolean {
  if (typeof window === "undefined") return false;
  const pageHost = window.location.hostname;
  const pageIsLocal =
    pageHost === "localhost" || pageHost === "127.0.0.1" || pageHost === "::1";
  const apiIsLocal =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(API_BASE_URL);
  return !pageIsLocal && apiIsLocal;
}

export function formatBdt(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  return `৳ ${Math.round(num).toLocaleString("en-US")}`;
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr-preview";
  const key = "nocturne_guest_session_id";
  let existing = window.localStorage.getItem(key);
  if (!existing) {
    existing = `noc-${crypto.randomUUID().slice(0, 12)}`;
    window.localStorage.setItem(key, existing);
  }
  return existing;
}

export async function fetchZones(
  date?: string,
  timeSlot = "20:30"
): Promise<DiningZone[]> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (timeSlot) params.set("time_slot", timeSlot);
  const res = await fetch(`${API_BASE_URL}/api/v1/zones?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load zones (${res.status})`);
  return res.json();
}

export async function fetchMenuItems(filters?: {
  category?: string;
  dairy_free?: boolean;
  nut_free?: boolean;
  gluten_free?: boolean;
  signature?: boolean;
  search?: string;
}): Promise<MenuItem[]> {
  const params = new URLSearchParams();
  if (filters?.category && filters.category !== "All") {
    params.set("category", filters.category);
  }
  if (filters?.dairy_free) params.set("dairy_free", "true");
  if (filters?.nut_free) params.set("nut_free", "true");
  if (filters?.gluten_free) params.set("gluten_free", "true");
  if (filters?.signature) params.set("signature", "true");
  if (filters?.search) params.set("search", filters.search);

  const res = await fetch(`${API_BASE_URL}/api/v1/menu?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load menu (${res.status})`);
  return res.json();
}

export async function fetchTables(params: {
  date: string;
  timeSlot: string;
  zone?: string;
  sessionId?: string;
}): Promise<RestaurantTable[]> {
  const qs = new URLSearchParams({
    date: params.date,
    time_slot: params.timeSlot,
  });
  if (params.zone) qs.set("zone", params.zone);
  if (params.sessionId) qs.set("session_id", params.sessionId);

  const res = await fetch(`${API_BASE_URL}/api/v1/tables?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load tables (${res.status})`);
  return res.json();
}

export async function holdTable(payload: {
  tableCode: string;
  reservationDate: string;
  timeSlot: string;
  sessionId: string;
  partySize?: number;
}): Promise<TableHoldResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/tables/${encodeURIComponent(payload.tableCode)}/hold`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_date: payload.reservationDate,
        time_slot: payload.timeSlot,
        session_id: payload.sessionId,
        party_size: payload.partySize,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      typeof err?.detail === "string"
        ? err.detail
        : err?.detail?.message || `Unable to hold table (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function releaseTableHold(payload: {
  tableCode: string;
  reservationDate: string;
  timeSlot: string;
  sessionId: string;
}): Promise<{ table_code: string; released: boolean }> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/tables/${encodeURIComponent(payload.tableCode)}/hold`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_date: payload.reservationDate,
        time_slot: payload.timeSlot,
        session_id: payload.sessionId,
      }),
    }
  );
  if (!res.ok) throw new Error(`Unable to release hold (${res.status})`);
  return res.json();
}

export async function confirmReservation(payload: {
  table_code: string;
  reservation_date: string;
  time_slot: string;
  session_id: string;
  guest_name: string;
  guest_phone: string;
  party_size: number;
  special_occasion?: string | null;
  payment_method?: PaymentMethod;
  items: {
    menu_item_id: number;
    menu_item_slug?: string;
    quantity: number;
    selected_modifiers: Record<string, unknown>;
  }[];
}): Promise<ReservationOut> {
  if (isLoopbackApiOnRemoteHost()) {
    throw new Error(
      "API endpoint is set to localhost in Vercel. Please configure NEXT_PUBLIC_API_URL."
    );
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/reservations/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Reservation failed"));
  }
  return res.json();
}

export async function fetchPaymentConfig(): Promise<PaymentConfigOut> {
  const res = await fetch(`${API_BASE_URL}/api/v1/payments/config`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load payment configuration (${res.status})`);
  return res.json();
}

export async function initEarlyPayment(payload: {
  reference_code: string;
  gateway: PaymentGateway;
  return_origin?: string;
}): Promise<PaymentInitResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/payments/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      typeof err?.detail === "string"
        ? err.detail
        : err?.detail?.message || `Payment initiation failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function verifyEarlyPayment(payload: {
  reference_code: string;
  gateway: PaymentGateway;
  payment_id: string;
  status?: string | null;
}): Promise<PaymentVerifyResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/payments/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      typeof err?.detail === "string"
        ? err.detail
        : err?.detail?.message || `Payment verification failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchConciergeStatus(): Promise<ConciergeLlmStatus> {
  const res = await fetch(`${API_BASE_URL}/api/v1/concierge/status`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Concierge status unavailable (${res.status})`);
  return res.json();
}

async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return `Nocturne backend is restarting or waking up (${res.status}). Please retry in a few seconds.`;
  }
  const err = await res.json().catch(() => ({}));
  if (typeof err?.detail === "string") return err.detail;
  if (typeof err?.detail?.message === "string") return err.detail.message;
  if (Array.isArray(err?.detail)) {
    const joined = err.detail
      .map((entry: { msg?: unknown }) => (typeof entry?.msg === "string" ? entry.msg : ""))
      .filter(Boolean)
      .join("; ");
    if (joined) return joined;
  }
  return `${fallback} (${res.status})`;
}

export async function lookupReservations(params: {
  phone?: string;
  reference_code?: string;
}): Promise<ReservationOut[]> {
  const query = new URLSearchParams();
  if (params.reference_code?.trim()) {
    query.set("reference_code", params.reference_code.trim().toUpperCase());
  } else if (params.phone?.trim()) {
    query.set("phone", params.phone.trim());
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/reservations?${query.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Lookup failed"));
  return res.json();
}

export async function fetchReservation(referenceCode: string): Promise<ReservationOut> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/reservations/${encodeURIComponent(referenceCode)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Reservation ${referenceCode} not found`);
  return res.json();
}

export async function checkInReservation(referenceCode: string): Promise<ReservationOut> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/reservations/${encodeURIComponent(referenceCode)}/check-in`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Check-in failed"));
  return res.json();
}

export async function cancelReservation(
  referenceCode: string,
  payload: { reason?: string; guest_phone?: string } = {}
): Promise<ReservationLifecycleResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/reservations/${encodeURIComponent(referenceCode)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Cancellation failed"));
  return res.json();
}

export async function markReservationNoShow(
  referenceCode: string,
  payload: { note?: string; host_override?: boolean } = {}
): Promise<ReservationLifecycleResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/reservations/${encodeURIComponent(referenceCode)}/no-show`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "No-show update failed"));
  return res.json();
}

export interface ConciergeStreamHandlers {
  onTrace?: (trace: ConciergeTrace) => void;
  onCitation?: (citation: ConciergeCitation) => void;
  onToken?: (text: string) => void;
  onCards?: (cards: ConciergeCardPayload) => void;
  onDone?: (meta: { ok: boolean; provider?: string; model?: string }) => void;
}

export async function streamConcierge(
  payload: {
    message: string;
    reservation_date: string;
    time_slot: string;
    party_size: number;
    session_id?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  },
  handlers: ConciergeStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  if (isLoopbackApiOnRemoteHost()) {
    throw new Error("Remote API endpoint not configured for this host.");
  }

  const handshakeController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    handshakeController.abort();
  }, 6500);

  const forwardAbort = () => handshakeController.abort();
  if (signal) {
    if (signal.aborted) {
      globalThis.clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", forwardAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/concierge/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: handshakeController.signal,
    });
  } catch (err) {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
    if (signal?.aborted) {
      throw err;
    }
    throw new Error("Concierge service unreachable.");
  }

  globalThis.clearTimeout(timeoutId);
  signal?.removeEventListener("abort", forwardAbort);

  if (!res.ok || !res.body) {
    throw new Error(`Concierge service unavailable (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let tokenCount = 0;

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      if (!frame.trim()) continue;
      let eventName = "message";
      let rawData = "{}";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          rawData = line.slice(5).trim();
        }
      }
      try {
        const parsed = JSON.parse(rawData);
        if (eventName === "trace") handlers.onTrace?.(parsed as ConciergeTrace);
        else if (eventName === "citation") handlers.onCitation?.(parsed as ConciergeCitation);
        else if (eventName === "token") {
          const text = parsed.text || "";
          if (text) tokenCount += 1;
          handlers.onToken?.(text);
        } else if (eventName === "cards") handlers.onCards?.(parsed as ConciergeCardPayload);
        else if (eventName === "done") handlers.onDone?.(parsed);
      } catch {
        // Ignore malformed partial frame
      }
    }
  }

  if (tokenCount === 0) {
    throw new Error("Concierge stream returned an empty response.");
  }
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  username: string;
  expires_at: string;
}

export interface AdminSessionOut {
  username: string;
  authenticated: boolean;
}

export interface AdminMenuPayload {
  name: string;
  slug?: string;
  category: string;
  description: string;
  base_price_bdt: number;
  calories_kcal: number;
  protein_grams: number;
  prep_time_mins: number;
  spice_level: number;
  is_dairy_free: boolean;
  is_nut_free: boolean;
  is_gluten_free: boolean;
  is_signature: boolean;
  allergen_flags: string[];
  image_url: string;
}

export interface AdminTablePayload {
  table_code: string;
  zone_slug: string;
  capacity_min: number;
  capacity_max: number;
  shape: "ROUND_2" | "RECT_4" | "BOOTH_6";
  svg_x: number;
  svg_y: number;
  svg_rotation: number;
  is_window_side: boolean;
  is_quiet_zone: boolean;
  noise_db: number;
  perspective_photo_url: string;
  vibe_notes: string;
}

export interface AdminTableLayoutItem {
  id: number;
  zone_slug?: string;
  svg_x: number;
  svg_y: number;
  svg_rotation: number;
}

function adminHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function adminLogin(payload: {
  username: string;
  password: string;
}): Promise<AdminLoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Admin sign-in failed"));
  return res.json();
}

export async function adminVerifySession(token: string): Promise<AdminSessionOut> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Admin session expired"));
  return res.json();
}

export async function adminCreateMenuItem(
  token: string,
  payload: AdminMenuPayload
): Promise<MenuItem> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/menu`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to create dish"));
  return res.json();
}

export async function adminUpdateMenuItem(
  token: string,
  itemId: number,
  payload: Partial<AdminMenuPayload>
): Promise<MenuItem> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/menu/${itemId}`, {
    method: "PUT",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to update dish"));
  return res.json();
}

export async function adminDeleteMenuItem(
  token: string,
  itemId: number
): Promise<{ deleted: boolean; id: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/menu/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to delete dish"));
  return res.json();
}

export async function adminCreateTable(
  token: string,
  payload: AdminTablePayload
): Promise<RestaurantTable> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/tables`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to create table"));
  return res.json();
}

export async function adminUpdateTable(
  token: string,
  tableId: number,
  payload: Partial<AdminTablePayload>
): Promise<RestaurantTable> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/tables/${tableId}`, {
    method: "PUT",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to update table"));
  return res.json();
}

export async function adminSaveTableLayout(
  token: string,
  tables: AdminTableLayoutItem[]
): Promise<RestaurantTable[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/tables/layout`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ tables }),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to save table layout"));
  return res.json();
}

export async function adminDeleteTable(
  token: string,
  tableId: number
): Promise<{ deleted: boolean; id: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/tables/${tableId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to delete table"));
  return res.json();
}
