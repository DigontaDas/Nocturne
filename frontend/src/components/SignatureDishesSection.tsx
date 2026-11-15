"use client";

import { useQuery } from "@tanstack/react-query";
import { PlanetaryDishWheel } from "@/components/PlanetaryDishWheel";
import { fetchMenuItems } from "@/lib/api";
import { FALLBACK_MENU_ITEMS } from "@/lib/fallback-data";

export function SignatureDishesSection() {
  const { data: dishes = FALLBACK_MENU_ITEMS } = useQuery({
    queryKey: ["menu-items"],
    queryFn: () => fetchMenuItems(),
    initialData: FALLBACK_MENU_ITEMS,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });

  return (
    <PlanetaryDishWheel
      dishes={dishes}
      fullCatalog={dishes}
      mode="pinned"
      sectionId="tasting"
      scrollLabel="Tasting"
      sectionLabel="Signature Tasting Menu"
      titlePrefix="Chef's Table"
      titleItalic="Sequence"
    />
  );
}
