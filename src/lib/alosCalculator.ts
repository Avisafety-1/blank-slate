// Calculates ALOS (Attitude Line of Sight) — the maximum VLOS distance.
// Mirrors the logic in supabase/functions/ai-risk-assessment/index.ts.
//
// Multirotor/helikopter:  ALOS = 327 × CD + 20 m
// Fastvinget/VTOL:        ALOS = 490 × CD + 30 m

export type AlosResult = {
  alosMaxM: number;
  alosCalculation: string;
  formula: 'multirotor' | 'fixed-wing';
};

export const isFixedWingDrone = (droneModel?: string | null): boolean => {
  if (!droneModel) return false;
  return /fixed|wing|fastving|fly|plane|vtol/i.test(droneModel);
};

export function calculateAlos(
  characteristicDimensionM?: number | null,
  droneModel?: string | null,
): AlosResult | null {
  if (
    typeof characteristicDimensionM !== 'number' ||
    !Number.isFinite(characteristicDimensionM) ||
    characteristicDimensionM <= 0
  ) {
    return null;
  }
  const fixedWing = isFixedWingDrone(droneModel);
  const multiplier = fixedWing ? 490 : 327;
  const offset = fixedWing ? 30 : 20;
  const alosMaxM = Math.round(multiplier * characteristicDimensionM + offset);
  return {
    alosMaxM,
    alosCalculation: `${multiplier} × ${characteristicDimensionM}m + ${offset}m = ${alosMaxM}m`,
    formula: fixedWing ? 'fixed-wing' : 'multirotor',
  };
}
