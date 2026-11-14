/**
 * Uniform framing helpers for Nocturne signature dish and mocktail photography.
 * Tall glassware (such as the stemmed coupe mocktail) frames higher vertically
 * so the rim and smoke garnish center cleanly inside circular apertures.
 */
export function getDishImageClass(imageUrl?: string | null, extra = ""): string {
  const url = (imageUrl || "").toLowerCase();
  const framing = url.includes("mocktail")
    ? "object-cover object-[50%_26%] scale-[1.01]"
    : "object-cover object-center scale-[1.02]";
  return ["w-full h-full", framing, extra].filter(Boolean).join(" ");
}
