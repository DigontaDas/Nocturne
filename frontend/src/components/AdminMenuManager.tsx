"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import {
  AdminMenuPayload,
  adminCreateMenuItem,
  adminDeleteMenuItem,
  adminUpdateMenuItem,
  formatBdt,
} from "@/lib/api";
import { MenuItem } from "@/types/nocturne";
import { AdminMediaField, MediaPreset } from "./AdminMediaField";

const DISH_MEDIA_PRESETS: MediaPreset[] = [
  { label: "Lamb Rack", url: "/media/dish-lamb-rack.png" },
  { label: "Norwegian Salmon", url: "/media/dish-salmon.png" },
  { label: "Duck Breast", url: "/media/dish-duck-breast.png" },
  { label: "Hero Wagyu", url: "/media/hero-steak.png" },
  { label: "Truffle Pasta", url: "/media/dish-pasta.png" },
  { label: "Saffron Risotto", url: "/media/dish-risotto.png" },
  { label: "Hokkaido Scallops", url: "/media/dish-scallops.png" },
  { label: "Burrata", url: "/media/dish-burrata.png" },
  { label: "Tartare", url: "/media/dish-tartare.png" },
  { label: "Hibiscus Mocktail", url: "/media/dish-mocktail.png" },
  { label: "Matcha Elixir", url: "/media/dish-matcha-elixir.png" },
  { label: "Tiramisu", url: "/media/dish-tiramisu.png" },
];

const DEFAULT_CATEGORIES = ["Starters", "Mains", "Desserts", "Zero-Proof Elixirs"];

interface DishDraft {
  name: string;
  category: string;
  description: string;
  base_price_bdt: string;
  calories_kcal: string;
  protein_grams: string;
  prep_time_mins: string;
  spice_level: string;
  is_dairy_free: boolean;
  is_nut_free: boolean;
  is_gluten_free: boolean;
  is_signature: boolean;
  allergen_text: string;
  image_url: string;
}

function emptyDishDraft(): DishDraft {
  return {
    name: "",
    category: "Mains",
    description: "",
    base_price_bdt: "1850",
    calories_kcal: "520",
    protein_grams: "34",
    prep_time_mins: "20",
    spice_level: "1",
    is_dairy_free: false,
    is_nut_free: true,
    is_gluten_free: false,
    is_signature: true,
    allergen_text: "",
    image_url: "/media/dish-lamb-rack.png",
  };
}

function draftFromItem(item: MenuItem): DishDraft {
  return {
    name: item.name,
    category: item.category,
    description: item.description,
    base_price_bdt: String(Math.round(Number(item.base_price_bdt))),
    calories_kcal: String(item.calories_kcal),
    protein_grams: String(item.protein_grams),
    prep_time_mins: String(item.prep_time_mins),
    spice_level: String(item.spice_level),
    is_dairy_free: item.is_dairy_free,
    is_nut_free: item.is_nut_free,
    is_gluten_free: item.is_gluten_free,
    is_signature: item.is_signature,
    allergen_text: (item.allergen_flags || []).join(", "),
    image_url: item.image_url,
  };
}

interface AdminMenuManagerProps {
  token: string;
  menuItems: MenuItem[];
  onCatalogChanged: () => void;
}

export function AdminMenuManager({
  token,
  menuItems,
  onCatalogChanged,
}: AdminMenuManagerProps) {
  const [selectedId, setSelectedId] = useState<number | "new">(
    menuItems[0]?.id ?? "new"
  );
  const [draft, setDraft] = useState<DishDraft>(() =>
    menuItems[0] ? draftFromItem(menuItems[0]) : emptyDishDraft()
  );
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const item of menuItems) {
      if (item.category) set.add(item.category);
    }
    return ["All", ...Array.from(set)];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (categoryFilter !== "All" && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [menuItems, categoryFilter, searchQuery]);

  const selectDish = (item: MenuItem) => {
    setSelectedId(item.id);
    setDraft(draftFromItem(item));
    setStatusMsg(null);
  };

  const startNewDish = () => {
    setSelectedId("new");
    setDraft(emptyDishDraft());
    setStatusMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (draft.name.trim().length < 2 || draft.description.trim().length < 4) {
      setStatusMsg({
        kind: "err",
        text: "Please enter both a dish title and description.",
      });
      return;
    }

    const payload: AdminMenuPayload = {
      name: draft.name.trim(),
      category: draft.category.trim() || "Mains",
      description: draft.description.trim(),
      base_price_bdt: Math.max(0, Number(draft.base_price_bdt) || 0),
      calories_kcal: Math.max(0, Math.round(Number(draft.calories_kcal) || 0)),
      protein_grams: Math.max(0, Math.round(Number(draft.protein_grams) || 0)),
      prep_time_mins: Math.max(1, Math.round(Number(draft.prep_time_mins) || 18)),
      spice_level: Math.min(5, Math.max(0, Math.round(Number(draft.spice_level) || 0))),
      is_dairy_free: draft.is_dairy_free,
      is_nut_free: draft.is_nut_free,
      is_gluten_free: draft.is_gluten_free,
      is_signature: draft.is_signature,
      allergen_flags: draft.allergen_text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      image_url: draft.image_url.trim() || "/media/dish-lamb-rack.png",
    };

    setBusy(true);
    try {
      if (selectedId === "new") {
        const created = await adminCreateMenuItem(token, payload);
        setSelectedId(created.id);
        setDraft(draftFromItem(created));
        setStatusMsg({
          kind: "ok",
          text: `Added '${created.name}' to live menu.`,
        });
      } else {
        const updated = await adminUpdateMenuItem(token, selectedId, payload);
        setDraft(draftFromItem(updated));
        setStatusMsg({
          kind: "ok",
          text: `Saved changes to '${updated.name}'.`,
        });
      }
      onCatalogChanged();
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not save menu item.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (selectedId === "new") return;
    setStatusMsg(null);
    setBusy(true);
    try {
      await adminDeleteMenuItem(token, selectedId);
      const remaining = menuItems.filter((item) => item.id !== selectedId);
      if (remaining[0]) {
        setSelectedId(remaining[0].id);
        setDraft(draftFromItem(remaining[0]));
      } else {
        setSelectedId("new");
        setDraft(emptyDishDraft());
      }
      setStatusMsg({ kind: "ok", text: "Dish removed from menu catalog." });
      onCatalogChanged();
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not delete dish.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Catalog Inventory List */}
      <div className="xl:col-span-5 border border-brass/25 bg-charcoal/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-sans text-[11px] uppercase tracking-[0.2em] text-brass">
              Live Culinary Catalog ({menuItems.length})
            </div>
            <p className="text-xs text-sand/80 mt-0.5">
              Select any dish to update pricing, nutrition, or photography.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewDish}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brass hover:bg-brass-light text-obsidian font-sans text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Dish</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-brass absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dishes..."
            className="w-full pl-9 pr-3 py-2 bg-obsidian border border-brass/25 text-xs font-sans text-cream placeholder:text-sand/45 focus:outline-none focus:border-brass"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 text-[10px] font-sans uppercase tracking-[0.14em] border transition-colors ${
                categoryFilter === cat
                  ? "border-brass bg-brass/15 text-brass"
                  : "border-brass/20 text-sand/75 hover:border-brass/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="max-h-[540px] overflow-y-auto pr-1 space-y-2">
          {filteredItems.map((item) => {
            const active = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectDish(item)}
                className={`w-full text-left flex items-center gap-3 p-3 border transition-colors ${
                  active
                    ? "border-brass bg-brass/10"
                    : "border-brass/20 bg-obsidian/70 hover:border-brass/50"
                }`}
              >
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-12 h-12 object-cover border border-brass/25 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-serif text-base text-cream truncate">
                      {item.name}
                    </span>
                    <span className="font-sans text-xs font-medium text-brass tabular-nums shrink-0">
                      {formatBdt(item.base_price_bdt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] font-sans text-sand/75">
                    <span>{item.category}</span>
                    <span>&middot;</span>
                    <span>{item.calories_kcal} kcal</span>
                    {item.is_signature && (
                      <span className="text-brass uppercase tracking-wider text-[10px]">
                        Signature
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="py-8 text-center text-xs text-sand/70 border border-brass/15">
              No dishes match your filter.
            </div>
          )}
        </div>
      </div>

      {/* Right: Create / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="xl:col-span-7 border border-brass/30 bg-charcoal/90 p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brass/20 pb-4">
          <div>
            <div className="font-sans text-[11px] uppercase tracking-[0.2em] text-brass">
              {selectedId === "new" ? "New Menu Creation" : `Editing Dish #${selectedId}`}
            </div>
            <h2 className="font-display text-xl text-cream tracking-wide mt-1">
              {draft.name || "Untitled Nocturne Creation"}
            </h2>
          </div>

          {selectedId !== "new" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-ember/45 hover:bg-ember/15 text-ember text-[11px] font-sans uppercase tracking-[0.14em] transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Dish</span>
            </button>
          )}
        </div>

        {statusMsg && (
          <div
            className={`px-4 py-3 border text-xs font-sans ${
              statusMsg.kind === "ok"
                ? "border-sage/50 bg-sage/10 text-cream"
                : "border-ember/50 bg-ember/10 text-cream"
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-sans text-[11px] uppercase tracking-[0.16em] text-sand/80 mb-1.5">
              Dish Name
            </label>
            <input
              type="text"
              required
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Oak-Roasted Crown of Lamb"
              className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-sm text-cream focus:outline-none focus:border-brass"
            />
          </div>

          <div>
            <label className="block font-sans text-[11px] uppercase tracking-[0.16em] text-sand/80 mb-1.5">
              Course / Category
            </label>
            <input
              type="text"
              list="nocturne-categories"
              required
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-sm text-cream focus:outline-none focus:border-brass"
            />
            <datalist id="nocturne-categories">
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block font-sans text-[11px] uppercase tracking-[0.16em] text-sand/80 mb-1.5">
            Chef Tasting Description
          </label>
          <textarea
            rows={3}
            required
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Describe provenance, smoke technique, and tasting notes..."
            className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-sm text-cream focus:outline-none focus:border-brass"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
              Price (BDT)
            </label>
            <input
              type="number"
              min={0}
              required
              value={draft.base_price_bdt}
              onChange={(e) =>
                setDraft((d) => ({ ...d, base_price_bdt: e.target.value }))
              }
              className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-sm text-brass tabular-nums focus:outline-none focus:border-brass"
            />
          </div>
          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
              Calories
            </label>
            <input
              type="number"
              min={0}
              value={draft.calories_kcal}
              onChange={(e) =>
                setDraft((d) => ({ ...d, calories_kcal: e.target.value }))
              }
              className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-sm text-cream tabular-nums focus:outline-none focus:border-brass"
            />
          </div>
          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
              Protein (g)
            </label>
            <input
              type="number"
              min={0}
              value={draft.protein_grams}
              onChange={(e) =>
                setDraft((d) => ({ ...d, protein_grams: e.target.value }))
              }
              className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-sm text-cream tabular-nums focus:outline-none focus:border-brass"
            />
          </div>
          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
              Prep (mins)
            </label>
            <input
              type="number"
              min={1}
              value={draft.prep_time_mins}
              onChange={(e) =>
                setDraft((d) => ({ ...d, prep_time_mins: e.target.value }))
              }
              className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-sm text-cream tabular-nums focus:outline-none focus:border-brass"
            />
          </div>
          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.14em] text-sand/80 mb-1">
              Spice (0-5)
            </label>
            <input
              type="number"
              min={0}
              max={5}
              value={draft.spice_level}
              onChange={(e) =>
                setDraft((d) => ({ ...d, spice_level: e.target.value }))
              }
              className="w-full px-3 py-2 bg-obsidian border border-brass/25 text-sm text-cream tabular-nums focus:outline-none focus:border-brass"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2.5 border border-brass/20 bg-obsidian/55 p-3.5">
            <div className="font-sans text-[10px] uppercase tracking-[0.16em] text-brass">
              Dietary &amp; Signature Flags
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-cream">
              {(
                [
                  ["is_signature", "Signature Course"],
                  ["is_dairy_free", "Dairy Free"],
                  ["is_nut_free", "Nut Free Safe"],
                  ["is_gluten_free", "Gluten Free"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft[field]}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [field]: e.target.checked }))
                    }
                    className="accent-[#D4AF37]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-sans text-[11px] uppercase tracking-[0.16em] text-sand/80 mb-1.5">
              Allergen Notes (comma-separated)
            </label>
            <input
              type="text"
              value={draft.allergen_text}
              onChange={(e) =>
                setDraft((d) => ({ ...d, allergen_text: e.target.value }))
              }
              placeholder="e.g. Dairy, Gluten, Shellfish"
              className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-xs text-cream placeholder:text-sand/45 focus:outline-none focus:border-brass"
            />
          </div>
        </div>

        <AdminMediaField
          label="Dish Photography"
          value={draft.image_url}
          onChange={(nextUrl) => setDraft((d) => ({ ...d, image_url: nextUrl }))}
          presets={DISH_MEDIA_PRESETS}
          aspectClass="h-44"
        />

        <div className="flex justify-end pt-2 border-t border-brass/20">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brass hover:bg-brass-light text-obsidian font-sans text-xs font-semibold uppercase tracking-[0.18em] transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {busy
                ? "Saving..."
                : selectedId === "new"
                ? "Publish New Dish"
                : "Save Dish Changes"}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
