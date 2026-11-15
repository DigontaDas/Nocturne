import { MenuItem, TrayItem } from "@/types/nocturne";

export type FlightStyle = "balanced" | "high-protein" | "light";

export interface DishPairingSuggestion {
  dish: MenuItem;
  rationale: string;
  combinedPriceBdt: number;
  combinedKcal: number;
}

export interface CuratedFlight {
  id: string;
  label: string;
  subtitle: string;
  dishes: MenuItem[];
  totalPriceBdt: number;
  totalKcal: number;
  totalProtein: number;
  maxPrepMins: number;
}

export interface TrayAuditSummary {
  itemCount: number;
  totalPriceBdt: number;
  totalKcal: number;
  totalProtein: number;
  peakPrepMins: number;
  allDairyFree: boolean;
  allNutFree: boolean;
  allGlutenFree: boolean;
  hasMocktail: boolean;
  hasStarter: boolean;
  hasMain: boolean;
  hasDessert: boolean;
}

export function createDefaultTrayItem(
  dish: MenuItem,
  keySuffix = "default"
): TrayItem {
  const portion = dish.customization_schema?.portions?.[0];
  const spice = dish.customization_schema?.spice_levels?.[0];
  const unitPrice =
    Number(dish.base_price_bdt) +
    (portion?.delta_bdt || 0) +
    (spice?.delta_bdt || 0);

  return {
    key: `${dish.id}::${keySuffix}`,
    menuItem: dish,
    quantity: 1,
    selectedModifiers: {
      portion: portion?.label,
      spice: spice?.label,
      sides: [],
    },
    unitPriceBdt: unitPrice,
    caloriesKcal:
      dish.calories_kcal +
      (portion?.delta_kcal || 0) +
      (spice?.delta_kcal || 0),
    proteinGrams:
      dish.protein_grams +
      (portion?.delta_protein || 0) +
      (spice?.delta_protein || 0),
    prepTimeMins: dish.prep_time_mins + (portion?.delta_prep_mins || 0),
  };
}

export function getPairedDish(
  activeDish: MenuItem,
  catalog: MenuItem[]
): DishPairingSuggestion | null {
  if (!catalog.length) return null;

  const findBySlug = (slug: string) => catalog.find((d) => d.slug === slug);

  let paired: MenuItem | undefined;
  let rationale = "Balanced by Chef Tariq for temperature and palate contrast.";

  if (activeDish.category === "Botanical Mocktails") {
    paired =
      activeDish.slug === "smoked-hibiscus-mocktail"
        ? findBySlug("wagyu-ribeye-steak") ||
          catalog.find((d) => d.category === "Wood-Fired Steaks")
        : findBySlug("miso-norwegian-salmon") ||
          catalog.find((d) => d.category === "Small Plates");
    rationale =
      activeDish.slug === "smoked-hibiscus-mocktail"
        ? "Tart charred hibiscus slices cleanly through rich oak-seared Wagyu marbling."
        : "Crisp Japanese yuzu and cold-brewed sencha lift white-miso glazed textures.";
  } else if (activeDish.category === "Desserts") {
    paired =
      findBySlug("yuzu-matcha-elixir") ||
      catalog.find((d) => d.category === "Botanical Mocktails");
    rationale =
      "Citrus-botanical acidity cleanses espresso mascarpone sweetness cleanly.";
  } else {
    const prefersHibiscus =
      activeDish.category === "Wood-Fired Steaks" ||
      activeDish.spice_level >= 2 ||
      activeDish.slug === "roasted-duck-breast" ||
      activeDish.slug === "herb-crusted-lamb-rack";

    paired = prefersHibiscus
      ? findBySlug("smoked-hibiscus-mocktail") ||
        catalog.find((d) => d.category === "Botanical Mocktails")
      : findBySlug("yuzu-matcha-elixir") ||
        catalog.find((d) => d.category === "Botanical Mocktails");

    if (!paired || paired.id === activeDish.id) {
      paired = catalog.find(
        (d) =>
          d.id !== activeDish.id && d.category === "Botanical Mocktails"
      );
    }
    if (!paired) {
      paired = catalog.find((d) => d.id !== activeDish.id);
    }

    rationale = prefersHibiscus
      ? "Zero-proof smoked hibiscus & pomegranate cuts ember char and deep jus notes."
      : "Chilled yuzu & matcha effervescence mirrors delicate umami and truffle aromatics.";
  }

  if (!paired || paired.id === activeDish.id) return null;

  return {
    dish: paired,
    rationale,
    combinedPriceBdt:
      Number(activeDish.base_price_bdt) + Number(paired.base_price_bdt),
    combinedKcal: activeDish.calories_kcal + paired.calories_kcal,
  };
}

function summarizeFlight(
  id: string,
  label: string,
  subtitle: string,
  items: MenuItem[]
): CuratedFlight | null {
  const unique = items.filter(
    (item, idx, arr) => arr.findIndex((other) => other.id === item.id) === idx
  );
  if (unique.length === 0) return null;

  return {
    id,
    label,
    subtitle,
    dishes: unique,
    totalPriceBdt: unique.reduce((s, d) => s + Number(d.base_price_bdt), 0),
    totalKcal: unique.reduce((s, d) => s + d.calories_kcal, 0),
    totalProtein: unique.reduce((s, d) => s + d.protein_grams, 0),
    maxPrepMins: Math.max(...unique.map((d) => d.prep_time_mins)),
  };
}

export function resolveCuratedFlights(catalog: MenuItem[]): CuratedFlight[] {
  if (!catalog.length) return [];

  const bySlug = (slug: string) => catalog.find((d) => d.slug === slug);
  const pickFirst = (predicate: (d: MenuItem) => boolean, excludeIds: number[]) =>
    catalog.find((d) => !excludeIds.includes(d.id) && predicate(d));

  const flights: CuratedFlight[] = [];

  // Flight 1: Ember Signature Trio
  const fireStarter =
    bySlug("hokkaido-scallops") ||
    pickFirst((d) => d.category === "Small Plates", []);
  const fireMain =
    bySlug("wagyu-ribeye-steak") ||
    pickFirst((d) => d.category === "Wood-Fired Steaks", fireStarter ? [fireStarter.id] : []);
  const fireDrink =
    bySlug("smoked-hibiscus-mocktail") ||
    pickFirst((d) => d.category === "Botanical Mocktails", []);
  const fireFlight = summarizeFlight(
    "fire-and-smoke",
    "Ember Reserve Trio",
    "Hokkaido scallops, aged Wagyu ribeye, and smoked hibiscus zero-proof pairing.",
    [fireStarter, fireMain, fireDrink].filter((d): d is MenuItem => Boolean(d))
  );
  if (fireFlight) flights.push(fireFlight);

  // Flight 2: Strict Allergen-Free Harmony (Dairy-Free + Nut-Free + Gluten-Free)
  const safePool = catalog.filter(
    (d) => d.is_dairy_free && d.is_nut_free && d.is_gluten_free
  );
  const safeStarter =
    safePool.find((d) => d.slug === "spiced-tuna-tartare") ||
    safePool.find((d) => d.category === "Small Plates");
  const safeMain =
    safePool.find((d) => d.slug === "miso-norwegian-salmon") ||
    safePool.find((d) => d.category === "Wood-Fired Steaks");
  const safeDrink =
    safePool.find((d) => d.slug === "yuzu-matcha-elixir") ||
    safePool.find((d) => d.category === "Botanical Mocktails");
  const safeFlight = summarizeFlight(
    "allergen-free-silk",
    "Clean Allergen Line",
    "Dedicated dairy-free, nut-free, and celiac-safe cast-iron progression.",
    [safeStarter, safeMain, safeDrink].filter((d): d is MenuItem => Boolean(d))
  );
  if (safeFlight) flights.push(safeFlight);

  // Flight 3: Truffle & Velvet Evening
  const eveningStarter =
    bySlug("artisan-fig-burrata") ||
    pickFirst((d) => d.category === "Small Plates", []);
  const eveningMain =
    bySlug("black-truffle-tagliatelle") ||
    pickFirst((d) => d.category === "Artisanal Pasta", []);
  const eveningDessert =
    bySlug("espresso-gold-tiramisu") ||
    pickFirst((d) => d.category === "Desserts", []);
  const eveningFlight = summarizeFlight(
    "velvet-evening",
    "Cellar & Truffle Duo",
    "Fig burrata, hand-cut black truffle tagliatelle, and cold-brew tiramisu.",
    [eveningStarter, eveningMain, eveningDessert].filter((d): d is MenuItem => Boolean(d))
  );
  if (eveningFlight) flights.push(eveningFlight);

  return flights;
}

export function buildBudgetSequence(
  catalog: MenuItem[],
  options: {
    maxBdt: number;
    style: FlightStyle;
    dairyFreeOnly: boolean;
    nutFreeOnly: boolean;
    glutenFreeOnly: boolean;
  }
): CuratedFlight | null {
  const eligible = catalog.filter((item) => {
    if (options.dairyFreeOnly && !item.is_dairy_free) return false;
    if (options.nutFreeOnly && !item.is_nut_free) return false;
    if (options.glutenFreeOnly && !item.is_gluten_free) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const sortByPreference = (list: MenuItem[]) =>
    [...list].sort((a, b) => {
      if (options.style === "high-protein") {
        return b.protein_grams - a.protein_grams;
      }
      if (options.style === "light") {
        return a.calories_kcal - b.calories_kcal;
      }
      return Number(b.is_signature) - Number(a.is_signature) ||
        Number(a.base_price_bdt) - Number(b.base_price_bdt);
    });

  const mains = sortByPreference(
    eligible.filter(
      (d) =>
        d.category === "Wood-Fired Steaks" || d.category === "Artisanal Pasta"
    )
  );
  const starters = sortByPreference(
    eligible.filter((d) => d.category === "Small Plates")
  );
  const drinks = sortByPreference(
    eligible.filter((d) => d.category === "Botanical Mocktails")
  );
  const desserts = sortByPreference(
    eligible.filter((d) => d.category === "Desserts")
  );

  // Try picking best 3-course or 2-course combination within budget
  const candidates: MenuItem[][] = [];

  const mainPool = mains.length ? mains : sortByPreference(eligible);
  for (const main of mainPool) {
    const starterOpts = starters.length ? [undefined, ...starters] : [undefined];
    const drinkOpts = drinks.length ? [undefined, ...drinks] : [undefined];
    const dessertOpts =
      options.style === "balanced" && desserts.length
        ? [undefined, ...desserts]
        : [undefined];

    for (const starter of starterOpts) {
      for (const drink of drinkOpts) {
        for (const dessert of dessertOpts) {
          const pack = [starter, main, drink, dessert].filter(
            (d): d is MenuItem => Boolean(d)
          );
          const uniquePack = pack.filter(
            (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i
          );
          const cost = uniquePack.reduce(
            (s, d) => s + Number(d.base_price_bdt),
            0
          );
          if (cost <= options.maxBdt) {
            candidates.push(uniquePack);
          }
        }
      }
    }
  }

  let chosen: MenuItem[];
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const hasDrinkDiff =
        Number(b.some((d) => d.category === "Botanical Mocktails")) -
        Number(a.some((d) => d.category === "Botanical Mocktails"));
      if (b.length !== a.length) return b.length - a.length;
      if (hasDrinkDiff !== 0) return hasDrinkDiff;

      if (options.style === "high-protein") {
        const protA = a.reduce((s, d) => s + d.protein_grams, 0);
        const protB = b.reduce((s, d) => s + d.protein_grams, 0);
        return protB - protA;
      }
      if (options.style === "light") {
        const calA = a.reduce((s, d) => s + d.calories_kcal, 0);
        const calB = b.reduce((s, d) => s + d.calories_kcal, 0);
        return calA - calB;
      }
      const priceA = a.reduce((s, d) => s + Number(d.base_price_bdt), 0);
      const priceB = b.reduce((s, d) => s + Number(d.base_price_bdt), 0);
      return priceB - priceA;
    });
    chosen = candidates[0];
  } else {
    // Fallback to the single closest matching plate under current allergen filters
    const sortedCheapest = [...eligible].sort(
      (a, b) => Number(a.base_price_bdt) - Number(b.base_price_bdt)
    );
    chosen = [sortedCheapest[0]];
  }

  const labelMap: Record<FlightStyle, string> = {
    balanced: "Balanced Tasting Sequence",
    "high-protein": "Oak-Fired High Protein",
    light: "Light Botanical Progression",
  };

  return summarizeFlight(
    `budget-${options.style}`,
    labelMap[options.style],
    `Calibrated up to ৳${options.maxBdt.toLocaleString("en-US")} under active dietary filters.`,
    chosen
  );
}

export function evaluateTrayAllergens(trayItems: TrayItem[]): TrayAuditSummary {
  if (trayItems.length === 0) {
    return {
      itemCount: 0,
      totalPriceBdt: 0,
      totalKcal: 0,
      totalProtein: 0,
      peakPrepMins: 0,
      allDairyFree: false,
      allNutFree: false,
      allGlutenFree: false,
      hasMocktail: false,
      hasStarter: false,
      hasMain: false,
      hasDessert: false,
    };
  }

  return {
    itemCount: trayItems.reduce((s, i) => s + i.quantity, 0),
    totalPriceBdt: trayItems.reduce(
      (s, i) => s + i.unitPriceBdt * i.quantity,
      0
    ),
    totalKcal: trayItems.reduce((s, i) => s + i.caloriesKcal * i.quantity, 0),
    totalProtein: trayItems.reduce(
      (s, i) => s + i.proteinGrams * i.quantity,
      0
    ),
    peakPrepMins: Math.max(...trayItems.map((i) => i.prepTimeMins)),
    allDairyFree: trayItems.every((i) => i.menuItem.is_dairy_free),
    allNutFree: trayItems.every((i) => i.menuItem.is_nut_free),
    allGlutenFree: trayItems.every((i) => i.menuItem.is_gluten_free),
    hasMocktail: trayItems.some(
      (i) => i.menuItem.category === "Botanical Mocktails"
    ),
    hasStarter: trayItems.some((i) => i.menuItem.category === "Small Plates"),
    hasMain: trayItems.some(
      (i) =>
        i.menuItem.category === "Wood-Fired Steaks" ||
        i.menuItem.category === "Artisanal Pasta"
    ),
    hasDessert: trayItems.some((i) => i.menuItem.category === "Desserts"),
  };
}
