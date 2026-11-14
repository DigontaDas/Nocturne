export type TableShape = "ROUND_2" | "RECT_4" | "BOOTH_6";
export type TableStatus = "AVAILABLE" | "HELD_BY_YOU" | "HELD_BY_OTHERS" | "BOOKED";
export type ReservationStatus =
  | "HELD"
  | "CONFIRMED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED";

export interface DiningZone {
  id: number;
  slug: string;
  name: string;
  ambient_noise_db: number;
  vibe_tagline: string;
  description: string;
  preview_image_url: string;
  preview_video_url?: string;
  table_count: number;
  available_count: number;
}

export interface RestaurantTable {
  id: number;
  table_code: string;
  zone_id: number;
  zone_slug: string;
  zone_name: string;
  capacity_min: number;
  capacity_max: number;
  shape: TableShape;
  svg_x: number;
  svg_y: number;
  svg_rotation: number;
  is_window_side: boolean;
  is_quiet_zone: boolean;
  noise_db: number;
  perspective_photo_url: string;
  vibe_notes: string;
  status: TableStatus;
  hold_ttl_seconds: number | null;
}

export interface CustomizationOption {
  id: string;
  label: string;
  delta_bdt: number;
  delta_kcal?: number;
  delta_protein?: number;
  delta_prep_mins?: number;
  spice_value?: number;
}

export interface CustomizationSchema {
  portions?: CustomizationOption[];
  spice_levels?: CustomizationOption[];
  sides?: CustomizationOption[];
}

export interface MenuItem {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string;
  base_price_bdt: number | string;
  calories_kcal: number;
  protein_grams: number;
  prep_time_mins: number;
  spice_level: number;
  is_dairy_free: boolean;
  is_nut_free: boolean;
  is_gluten_free: boolean;
  is_signature: boolean;
  allergen_flags: string[];
  customization_schema: CustomizationSchema;
  image_url: string;
}

export interface TableHoldResponse {
  table_code: string;
  reservation_date: string;
  time_slot: string;
  session_id: string;
  status: "HELD_BY_YOU";
  ttl_seconds: number;
  expires_at: string;
}

export interface TrayItem {
  key: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: {
    portion?: string;
    spice?: string;
    sides?: string[];
  };
  unitPriceBdt: number;
  caloriesKcal: number;
  proteinGrams: number;
  prepTimeMins: number;
}

export interface ReservationItemOut {
  id: number;
  menu_item_id: number;
  dish_name: string;
  dish_slug: string;
  image_url: string;
  quantity: number;
  selected_modifiers: Record<string, unknown>;
  unit_price_bdt: number | string;
}

export interface ReservationOut {
  id: number;
  reference_code: string;
  table_code: string;
  zone_name: string;
  zone_slug: string;
  guest_name: string;
  guest_phone: string;
  party_size: number;
  reservation_date: string;
  time_slot: string;
  status: ReservationStatus;
  special_occasion: string | null;
  pre_order_total_bdt: number | string;
  version: number;
  created_at: string;
  items: ReservationItemOut[];
}

export interface ConciergeTrace {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done";
  detail: string;
}

export interface ConciergeCitation {
  badge: string;
  title: string;
  source_filename: string;
  section_ref: string;
  dish_slug?: string | null;
  snippet: string;
  score: number;
}

export interface ConciergeCardPayload {
  recommended_table: RestaurantTable | null;
  alternative_tables?: RestaurantTable[];
  recommended_dishes: MenuItem[];
  pairing_total_bdt: number;
  reservation_date: string;
  time_slot: string;
  party_size: number;
  cta_label: string;
}
