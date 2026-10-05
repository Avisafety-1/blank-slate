// Helpers for the drone model catalog lookup.

/** Removes characters that break PostgREST filters (`,` `(` `)` `%` `_` `*`). */
export const sanitizeIlikeTerm = (value: string | null | undefined): string =>
  String(value ?? '').replace(/[,()%_*\\]/g, ' ').replace(/\s+/g, ' ').trim();

/** Search terms for a model name: full name and name without "DJI " prefix. */
export const modelSearchTerms = (model: string | null | undefined): string[] => {
  const full = sanitizeIlikeTerm(model);
  const noDji = sanitizeIlikeTerm(String(model ?? '').replace(/^DJI\s+/i, ''));
  // Also try the part before a parenthesis, e.g. "Mavic 3 Enterprise (M3E)".
  const beforeParen = sanitizeIlikeTerm(String(model ?? '').replace(/^DJI\s+/i, '').split('(')[0]);
  return [...new Set([full, noDji, beforeParen].filter((t) => t.length >= 2))];
};

const FIXED_WING = /\b(fixed[- ]?wing|vtol|wing|fastvinge?)\b/i;
const MULTIROTOR = /\b(multirotor|multicopter|quadcopter|hexacopter|octocopter|rotor)\b/i;

/** Catalog category decides first; model name with word boundaries as fallback. */
export const isFixedWingDrone = (droneModel?: string | null, catalogCategory?: string | null): boolean => {
  const cat = String(catalogCategory ?? '');
  if (FIXED_WING.test(cat)) return true;
  if (MULTIROTOR.test(cat)) return false;
  return FIXED_WING.test(String(droneModel ?? ''));
};
