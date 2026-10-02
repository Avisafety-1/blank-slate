/** CAA's pilot-facing classification, not a guess from the Naturbase protection form. */
export const NATURE_ZONE_LAYER_IDS = ["verneomrader_forbud", "verneomrader_obs"];

export const natureZoneColor = (layerId: string) =>
  layerId === "verneomrader_forbud" ? "hsl(var(--nature-prohibited))" : "hsl(var(--nature-observe))";