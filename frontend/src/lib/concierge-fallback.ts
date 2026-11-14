import {
  ConciergeCardPayload,
  ConciergeCitation,
  MenuItem,
  RestaurantTable,
} from "@/types/nocturne";
import { FALLBACK_MENU_ITEMS, FALLBACK_TABLES } from "@/lib/fallback-data";

export interface LocalConciergeResult {
  replyMarkdown: string;
  citations: ConciergeCitation[];
  cards: ConciergeCardPayload | null;
}

interface ParsedIntents {
  partySize: number;
  maxBudgetBdt: number | null;
  zoneSlug: string | null;
  quietOnly: boolean;
  windowOnly: boolean;
  dairyFree: boolean;
  nutFree: boolean;
  glutenFree: boolean;
  wantsPairing: boolean;
  isPolicyQuery: boolean;
  isGreetingOnly: boolean;
}

function parseIntents(query: string, defaultPartySize: number): ParsedIntents {
  const low = query.toLowerCase();

  const partyMatch = query.match(
    /(?:for|party\s+of|guests?\s*:?)\s*(\d{1,2})\b/i
  );
  let partySize = defaultPartySize;
  if (partyMatch) {
    const parsed = Number(partyMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) {
      partySize = parsed;
    }
  }

  const budgetMatch = query.match(
    /(?:under|below|max(?:imum)?|within|less\s+than|<)\s*(?:৳|bdt|tk\.?)?\s*([\d,]+)/i
  );
  const maxBudgetBdt = budgetMatch
    ? Number(budgetMatch[1].replace(/,/g, ""))
    : null;

  let zoneSlug: string | null = null;
  if (
    low.includes("velvet") ||
    low.includes("booth") ||
    low.includes("lounge") ||
    low.includes("private")
  ) {
    zoneSlug = "private-lounge";
  } else if (
    low.includes("glass kitchen") ||
    low.includes("main hall") ||
    low.includes("hearth")
  ) {
    zoneSlug = "main-hall";
  } else if (
    low.includes("rooftop") ||
    low.includes("skyline") ||
    low.includes("terrace")
  ) {
    zoneSlug = "rooftop";
  }

  const quietOnly = [
    "quiet",
    "away from kitchen",
    "away from the kitchen",
    "peaceful",
    "intimate",
    "anniversary",
    "conversation",
    "romantic",
  ].some((kw) => low.includes(kw));

  const windowOnly = ["window", "skyline", "lake", "sunset", "view"].some(
    (kw) => low.includes(kw)
  );

  const dairyFree = [
    "dairy-free",
    "dairy free",
    "no dairy",
    "lactose",
    "ghee-free",
    "ghee free",
  ].some((kw) => low.includes(kw));

  const nutFree = [
    "nut-free",
    "nut free",
    "no nuts",
    "peanut",
    "pistachio",
  ].some((kw) => low.includes(kw));

  const glutenFree = [
    "gluten-free",
    "gluten free",
    "celiac",
    "no gluten",
  ].some((kw) => low.includes(kw));

  const wantsPairing = [
    "pairing",
    "mocktail",
    "drink",
    "elixir",
    "beverage",
    "main",
    "dish",
    "course",
    "food",
    "eat",
    "dinner",
    "steak",
    "salmon",
    "lamb",
    "duck",
    "pasta",
    "risotto",
    "scallop",
    "tiramisu",
  ].some((kw) => low.includes(kw));

  const isPolicyQuery = [
    "cancel",
    "refund",
    "no-show",
    "no show",
    "late",
    "grace",
    "deposit",
    "halal",
    "zabiha",
    "address",
    "location",
    "where",
    "hour",
    "parking",
  ].some((kw) => low.includes(kw));

  const words = low.replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/);
  const isGreetingOnly =
    words.length <= 3 &&
    words.some((w) => ["hi", "hello", "hey", "salam", "assalamu"].includes(w)) &&
    !wantsPairing &&
    !quietOnly &&
    !isPolicyQuery;

  return {
    partySize,
    maxBudgetBdt:
      maxBudgetBdt !== null && Number.isFinite(maxBudgetBdt) ? maxBudgetBdt : null,
    zoneSlug,
    quietOnly,
    windowOnly,
    dairyFree,
    nutFree,
    glutenFree,
    wantsPairing,
    isPolicyQuery,
    isGreetingOnly,
  };
}

function selectTables(
  sourceTables: RestaurantTable[],
  intents: ParsedIntents
): RestaurantTable[] {
  const open = sourceTables.filter(
    (t) => t.status === "AVAILABLE" || t.status === "HELD_BY_YOU"
  );

  let candidates = open.filter((t) => {
    if (intents.partySize > t.capacity_max || intents.partySize < t.capacity_min) {
      return false;
    }
    if (intents.zoneSlug && t.zone_slug !== intents.zoneSlug) {
      return false;
    }
    if (intents.quietOnly && !t.is_quiet_zone) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    candidates = open.filter(
      (t) =>
        intents.partySize >= t.capacity_min && intents.partySize <= t.capacity_max
    );
  }
  if (candidates.length === 0) {
    candidates = open.filter((t) => t.capacity_max >= intents.partySize);
  }
  if (candidates.length === 0) {
    candidates = open;
  }

  return [...candidates]
    .sort((a, b) => {
      const capA = Math.abs(a.capacity_max - intents.partySize);
      const capB = Math.abs(b.capacity_max - intents.partySize);
      const winA = a.is_window_side ? 0 : 1;
      const winB = b.is_window_side ? 0 : 1;
      const quietA = a.is_quiet_zone ? 0 : 1;
      const quietB = b.is_quiet_zone ? 0 : 1;

      if (intents.quietOnly) {
        return (
          quietA - quietB ||
          winA - winB ||
          a.noise_db - b.noise_db ||
          capA - capB ||
          a.table_code.localeCompare(b.table_code)
        );
      }
      if (intents.windowOnly) {
        return (
          winA - winB ||
          a.noise_db - b.noise_db ||
          capA - capB ||
          quietA - quietB ||
          a.table_code.localeCompare(b.table_code)
        );
      }
      return (
        capA - capB ||
        a.noise_db - b.noise_db ||
        quietA - quietB ||
        winA - winB ||
        a.table_code.localeCompare(b.table_code)
      );
    })
    .slice(0, 6);
}

function dishKeywordBonus(queryLower: string, dish: MenuItem): number {
  const tokens = queryLower.match(/[a-z0-9_]+/g) || [];
  const haystack = `${dish.slug} ${dish.name} ${dish.description} ${dish.category}`.toLowerCase();
  return tokens.reduce(
    (score, tok) => (tok.length > 3 && haystack.includes(tok) ? score + 1 : score),
    0
  );
}

function selectDishes(
  sourceMenu: MenuItem[],
  query: string,
  intents: ParsedIntents
): { dishes: MenuItem[]; pairingTotalBdt: number } {
  const low = query.toLowerCase();
  const safe = sourceMenu.filter((item) => {
    if (intents.dairyFree && !item.is_dairy_free) return false;
    if (intents.nutFree && !item.is_nut_free) return false;
    if (intents.glutenFree && !item.is_gluten_free) return false;
    return true;
  });

  if (safe.length === 0) return { dishes: [], pairingTotalBdt: 0 };

  const wantsDessertOrStarter = [
    "dessert",
    "tiramisu",
    "sweet",
    "starter",
    "small plate",
    "appetizer",
    "scallop",
    "burrata",
    "tartare",
  ].some((kw) => low.includes(kw));

  const foodItems = safe.filter((m) => m.category !== "Botanical Mocktails");
  let mains = wantsDessertOrStarter
    ? foodItems
    : safe.filter(
        (m) => m.category === "Wood-Fired Steaks" || m.category === "Artisanal Pasta"
      );
  if (mains.length === 0) {
    const smallPlates = safe.filter((m) => m.category === "Small Plates");
    mains = smallPlates.length > 0 ? smallPlates : safe;
  }
  const mocktails = safe.filter((m) => m.category === "Botanical Mocktails");

  const sortDishes = (list: MenuItem[]) =>
    [...list].sort(
      (a, b) =>
        dishKeywordBonus(low, b) - dishKeywordBonus(low, a) ||
        Number(b.is_signature) - Number(a.is_signature) ||
        Number(a.base_price_bdt) - Number(b.base_price_bdt)
    );

  const sortedMains = sortDishes(mains);
  const sortedMocktails = sortDishes(mocktails);

  let chosen: MenuItem[] = [];
  if (
    sortedMains.length > 0 &&
    sortedMocktails.length > 0 &&
    (intents.wantsPairing || intents.maxBudgetBdt !== null)
  ) {
    let bestPair: [MenuItem, MenuItem] | null = null;
    if (intents.maxBudgetBdt !== null) {
      for (const main of sortedMains) {
        for (const drink of sortedMocktails) {
          if (
            Number(main.base_price_bdt) + Number(drink.base_price_bdt) <=
            intents.maxBudgetBdt
          ) {
            bestPair = [main, drink];
            break;
          }
        }
        if (bestPair) break;
      }
    }
    chosen = bestPair ?? [sortedMains[0], sortedMocktails[0]];
  } else if (sortedMains.length > 0) {
    const underBudget =
      intents.maxBudgetBdt !== null
        ? sortedMains.find((m) => Number(m.base_price_bdt) <= intents.maxBudgetBdt!)
        : undefined;
    chosen = [underBudget ?? sortedMains[0]];
  } else if (sortedMocktails.length > 0) {
    chosen = [sortedMocktails[0]];
  }

  const pairingTotalBdt = Math.round(
    chosen.reduce((sum, item) => sum + Number(item.base_price_bdt), 0)
  );
  return { dishes: chosen, pairingTotalBdt };
}

export function buildLocalConciergeReply(params: {
  message: string;
  reservationDate: string;
  timeSlot: string;
  partySize: number;
  tables?: RestaurantTable[];
  menuItems?: MenuItem[];
}): LocalConciergeResult {
  const {
    message,
    reservationDate,
    timeSlot,
    partySize,
    tables = FALLBACK_TABLES,
    menuItems = FALLBACK_MENU_ITEMS,
  } = params;

  const intents = parseIntents(message, partySize);

  if (intents.isGreetingOnly) {
    return {
      replyMarkdown: [
        "Good evening from Nocturne on Level 14, Banani Road 11.",
        "",
        "Share your preferred wing (Skyline Rooftop, Chef's Glass Kitchen, or Velvet Booth Lounge), guest count, dietary requirements, or a BDT budget and I will pair the ideal table and wood-fired sequence for tonight.",
      ].join("\n"),
      citations: [],
      cards: null,
    };
  }

  if (intents.isPolicyQuery && !intents.wantsPairing && !intents.quietOnly) {
    const lines = [
      "### Nocturne Evening Policies & House Notes",
      "- **Location & Hours:** Level 14 Penthouse, Banani Road 11, Dhaka. Evening seatings run at **19:00**, **20:30**, and **22:00** [Rooftop Seating SOP §1.1].",
      "- **Kitchen & Dietary Separation:** 100% Zabiha Halal sourcing with zero-proof botanical mixology, dedicated cast-iron stations for **dairy-free** and **nut-free** preparation, and isolated gluten-free finishing surfaces [Chef Allergen Guide §1.2].",
      "- **Cancellation & No-Show Grace:** Cancellations more than **4 hours** prior to seating receive a **100% refund** of any pre-paid deposit or pre-order. Cancellations inside 4 hours or no-shows past the **15-minute** grace window retain the **৳ 1,000** penthouse table reservation fee and refund all pre-order culinary charges above it [Rooftop Seating SOP §2.4].",
    ];
    return {
      replyMarkdown: lines.join("\n"),
      citations: [
        {
          badge: "[Rooftop Seating SOP §2.4]",
          title: "Rooftop Seating & Policy SOP",
          source_filename: "02_rooftop_seating_and_policy_sop.md",
          section_ref: "§2.4",
          snippet:
            "4-hour complimentary full cancellation refund window and 15-minute grace hold policy.",
          score: 0.96,
        },
        {
          badge: "[Chef Allergen Guide §1.2]",
          title: "Chef Allergen Matrix 2026",
          source_filename: "01_chef_allergen_and_ingredient_matrix.md",
          section_ref: "§1.2",
          snippet:
            "Dedicated cast-iron stations and zero-proof barware isolation for dairy-free, nut-free, and gluten-free orders.",
          score: 0.94,
        },
      ],
      cards: null,
    };
  }

  const matchedTables = selectTables(tables, intents);
  const topTable = matchedTables[0] ?? null;
  const { dishes, pairingTotalBdt } = selectDishes(menuItems, message, intents);

  const citations: ConciergeCitation[] = [
    {
      badge: "[Verified Guest Reviews §1.1]",
      title: "Verified Diner Reviews 2026",
      source_filename: "04_verified_guest_reviews.md",
      section_ref: "§1.1",
      snippet:
        "Skyline corner tables stay shielded by jasmine trellises for unhurried conversation below 52 dB.",
      score: 0.97,
    },
    {
      badge: "[Chef Allergen Guide §1.2]",
      title: "Chef Allergen Matrix 2026",
      source_filename: "01_chef_allergen_and_ingredient_matrix.md",
      section_ref: "§1.2",
      snippet:
        "Dairy-free, nut-free, and gluten-free entrées finish on isolated olive-oil cast-iron surfaces.",
      score: 0.95,
    },
    {
      badge: "[Sommelier Pairing Guide §1.2]",
      title: "Sommelier Zero-Proof Pairings",
      source_filename: "03_sommelier_mocktail_pairings.md",
      section_ref: "§1.2",
      snippet:
        "Cold-steeped smoked hibiscus and citrus verjus lift wood-fired fillets without dairy richness.",
      score: 0.93,
    },
  ];

  const lines: string[] = [];
  if (topTable) {
    lines.push(
      `### Recommended Table — \`${topTable.table_code}\` (${topTable.zone_name})`
    );
    lines.push(
      `Available for **${intents.partySize} guests** on **${reservationDate}** at **${timeSlot}**, metered at **${topTable.noise_db} dB** (${
        topTable.is_window_side ? "skyline window-side" : "architectural gallery"
      }, ${
        topTable.is_quiet_zone
          ? "quiet conversation zone"
          : "lively hearth energy"
      }) [Verified Guest Reviews §1.1].`
    );
    lines.push(`*${topTable.vibe_notes}*`);
  }

  if (dishes.length > 0) {
    lines.push("");
    lines.push("### Curated Dish & Zero-Proof Pairing");
    for (const item of dishes) {
      const tags: string[] = [];
      if (item.is_dairy_free) tags.push("Dairy-Free");
      if (item.is_nut_free) tags.push("Nut-Free");
      if (item.is_gluten_free) tags.push("Gluten-Free");
      const tagSummary = tags.length > 0 ? tags.join(", ") : "Chef Signature";
      lines.push(
        `- **${item.name}** — **৳ ${Math.round(Number(item.base_price_bdt)).toLocaleString("en-US")}** (${item.calories_kcal} kcal · ${item.protein_grams}g protein · ${tagSummary})`
      );
    }

    const budgetNote =
      intents.maxBudgetBdt !== null && pairingTotalBdt <= intents.maxBudgetBdt
        ? ` (comfortably within your **৳ ${intents.maxBudgetBdt.toLocaleString("en-US")}** target)`
        : "";

    lines.push("");
    lines.push(
      `**Pairing Total: ৳ ${pairingTotalBdt.toLocaleString("en-US")}**${budgetNote}. Prepared on isolated cast-iron & barware stations for allergen safety [Chef Allergen Guide §1.2] [Sommelier Pairing Guide §1.2].`
    );
  }

  lines.push("");
  lines.push(
    "Use **Hold Table & Add Pairing** below to lock this seat for 10 minutes and add these plates directly to your tray."
  );

  return {
    replyMarkdown: lines.join("\n"),
    citations,
    cards:
      topTable || dishes.length > 0
        ? {
            recommended_table: topTable,
            alternative_tables: matchedTables.slice(1, 3),
            recommended_dishes: dishes,
            pairing_total_bdt: pairingTotalBdt,
            reservation_date: reservationDate,
            time_slot: timeSlot,
            party_size: intents.partySize,
            cta_label: "Hold Table & Add Pairing",
          }
        : null,
  };
}
