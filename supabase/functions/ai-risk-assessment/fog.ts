// Fog advisory. MET Locationforecast has no visibility in km, so fog never
// creates a hard stop — it floors the weather category at BETINGET.

export const FOG_FRACTION_THRESHOLD = 50;

export interface FogAdvisory {
  fraction: number | null;
  symbolFog: boolean;
  text: string;
}

export const deriveFogAdvisory = (input: {
  skipWeather: boolean;
  current: Record<string, unknown> | null | undefined;
  maxVisibilityKm: number | null | undefined;
  lang: 'no' | 'en';
}): FogAdvisory | null => {
  if (input.skipWeather || !input.current) return null;
  const raw = input.current.fog_area_fraction;
  const fraction = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  const validFraction = fraction !== null && Number.isFinite(fraction) ? fraction : null;
  const symbolFog = String(input.current.symbol ?? '').toLowerCase().includes('fog');
  if (!symbolFog && !(validFraction !== null && validFraction >= FOG_FRACTION_THRESHOLD)) return null;
  const km = Number(input.maxVisibilityKm);
  const hasKm = input.maxVisibilityKm !== null && input.maxVisibilityKm !== undefined && Number.isFinite(km) && km > 0;
  const text = input.lang === 'en'
    ? `Fog forecast — check visibility against the company limit${hasKm ? ` (${km} km)` : ''} before flight`
    : `Tåke meldt — kontroller sikt mot selskapets grense${hasKm ? ` (${km} km)` : ''} før flyging`;
  return { fraction: validFraction, symbolFog, text };
};
