import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPrompts, buildSoraReassessSystemPrompt, buildSoraReassessUserPrompt, normalizeLang } from "./prompts.ts";
import { deriveAec, residualArcForDensity } from "./soraAirRisk.ts";

import {
  calculateDroneAggregatedStatus,
  calculateDroneInspectionStatus,
  calculateEquipmentMaintenanceStatus,
  worstStatus,
  type Status as MaintStatus,
} from "./maintenanceStatus.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PilotInput {
  flightHeight: number;
  operationType: string;
  isVlos: boolean;
  observerCount: number;
  atcRequired: boolean;
  proximityToPeople: string;
  criticalInfrastructure: boolean;
  backupLandingAvailable: boolean;
  skipWeatherEvaluation: boolean;
}

const normalizeRiskScore = (score: number | string | undefined | null): number | null => {
  if (score === undefined || score === null) return null;
  const numericScore = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numericScore)) return null;
  if (numericScore > 0 && numericScore < 1) return Math.round(numericScore * 10);
  return Math.max(1, Math.min(10, Math.round(numericScore)));
};

const deriveRiskRecommendation = (
  score: number | string | undefined | null,
  hardStopTriggered = false,
  fallback: string = 'caution'
): 'go' | 'caution' | 'no-go' => {
  if (hardStopTriggered) return 'no-go';
  const normalizedScore = normalizeRiskScore(score);
  if (normalizedScore === null) {
    const normalizedFallback = fallback?.toLowerCase();
    if (normalizedFallback === 'go' || normalizedFallback === 'caution' || normalizedFallback === 'no-go') {
      return normalizedFallback;
    }
    return 'caution';
  }
  if (normalizedScore >= 7) return 'go';
  if (normalizedScore >= 5) return 'caution';
  return 'no-go';
};

const normalizeDroneModelName = (value: string): string => value
  .toLowerCase()
  .replace(/\bdji\b|\bautel\b|\bparrot\b|\bskydio\b|\byuneec\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const pickBestDroneModelMatch = <T extends { name: string }>(models: T[], droneModelName: string): T | null => {
  const normalizedDroneName = normalizeDroneModelName(droneModelName);
  if (!normalizedDroneName) return null;

  const exact = models.find((model) => normalizeDroneModelName(model.name) === normalizedDroneName);
  if (exact) return exact;

  const candidates = models
    .map((model) => {
      const normalizedCatalogName = normalizeDroneModelName(model.name);
      const catalogTokens = normalizedCatalogName.split(' ').filter(Boolean);
      const droneTokens = normalizedDroneName.split(' ').filter(Boolean);
      const sharedTokens = catalogTokens.filter((token) => droneTokens.includes(token)).length;
      const contains = normalizedCatalogName.includes(normalizedDroneName) || normalizedDroneName.includes(normalizedCatalogName);
      return { model, score: (contains ? 100 : 0) + sharedTokens * 10 - Math.abs(catalogTokens.length - droneTokens.length) };
    })
    .filter((candidate) => candidate.score >= 18)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.model ?? null;
};

const isFixedWingDrone = (droneModel?: string | null, catalogCategory?: string | null): boolean => {
  const value = `${droneModel ?? ''} ${catalogCategory ?? ''}`.toLowerCase();
  return /fixed|wing|fastving|fly|plane|vtol/.test(value);
};

const calculateAlos = (characteristicDimensionM?: number | null, fixedWing = false) => {
  if (typeof characteristicDimensionM !== 'number' || !Number.isFinite(characteristicDimensionM) || characteristicDimensionM <= 0) {
    return null;
  }
  const multiplier = fixedWing ? 490 : 327;
  const offset = fixedWing ? 30 : 20;
  const alosMaxM = Math.round(multiplier * characteristicDimensionM + offset);
  return {
    alosMaxM,
    alosCalculation: `${multiplier} × ${characteristicDimensionM}m + ${offset}m = ${alosMaxM}m`,
    formula: fixedWing ? 'fixed-wing' : 'multirotor',
  };
};

type RouteCoord = { lat: number; lng: number };

const metersPerDegLat = 111_320;

const formatNbNumber = (value: number, maximumFractionDigits = 0): string =>
  value.toLocaleString('nb-NO', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  });

type Lang = 'no' | 'en';
const resolveLang = (input: unknown): Lang =>
  String(input ?? 'no').toLowerCase().startsWith('en') ? 'en' : 'no';

const formatLocaleNumber = (value: number, maximumFractionDigits = 0, lang: Lang = 'no'): string =>
  value.toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  });

const derivePopulationDensityBand = (densityPerKm2: number, lang: Lang = 'no'): string => {
  if (lang === 'en') {
    if (densityPerKm2 <= 0) return 'Controlled ground area / uninhabited';
    if (densityPerKm2 < 100) return 'Sparsely populated (<100/km²)';
    if (densityPerKm2 < 500) return 'Populated (<500/km²)';
    if (densityPerKm2 < 1500) return 'Densely populated (<1500/km²)';
    return 'Gatherings of people / very densely populated (>1500/km²)';
  }
  if (densityPerKm2 <= 0) return 'Kontrollert bakkeområde / ubebodd';
  if (densityPerKm2 < 100) return 'Tynt befolket (<100/km²)';
  if (densityPerKm2 < 500) return 'Befolket (<500/km²)';
  if (densityPerKm2 < 1500) return 'Tett befolket (<1500/km²)';
  return 'Folkemengder / svært tett befolket (>1500/km²)';
};

const GRC_DIMENSION_LIMITS = [1, 3, 8, 20, 40];
const GRC_SPEED_LIMITS = [25, 35, 75, 120, 200];
const GRC_MATRIX = [
  [[1, 2, 3, 4, 5], [1, 2, 3, 5, 6], [2, 3, 4, 6, 7], [3, 4, 5, 7, 8], [4, 5, 6, 8, 9]],
  [[2, 3, 4, 5, 6], [2, 3, 4, 6, 7], [3, 4, 5, 7, 8], [4, 5, 6, 8, 9], [5, 6, 7, 9, 10]],
  [[3, 4, 5, 6, 7], [3, 4, 5, 7, 8], [4, 5, 6, 8, 9], [5, 6, 7, 9, 10], [6, 7, 8, 10, 10]],
  [[4, 5, 6, 7, 8], [4, 5, 6, 8, 9], [5, 6, 7, 9, 10], [6, 7, 8, 10, 10], [7, 8, 9, 10, 10]],
  [[5, 6, 7, 8, 9], [5, 6, 7, 9, 10], [6, 7, 8, 10, 10], [7, 8, 9, 10, 10], [8, 9, 10, 10, 10]],
] as const;

const firstLimitIndex = (limits: number[], value: number): number => {
  const index = limits.findIndex((limit) => value <= limit);
  return index === -1 ? limits.length - 1 : index;
};

const populationClassIndex = (densityPerKm2: number): number => {
  if (densityPerKm2 <= 0) return 0;
  if (densityPerKm2 < 100) return 1;
  if (densityPerKm2 < 500) return 2;
  if (densityPerKm2 < 1500) return 3;
  return 4;
};

const buildDeterministicGroundRisk = ({
  characteristicDimensionM,
  maxSpeedMps,
  weightKg,
  populationDensityValue,
  populationDensityAverage,
  populationData,
  assignedEquipment,
  observerCount = 0,
  lang = 'no',
  manualMitigations = null,
}: {
  characteristicDimensionM: number;
  maxSpeedMps: number;
  weightKg: number | null;
  populationDensityValue: number;
  populationDensityAverage: number | null;
  populationData: any | null;
  assignedEquipment: any[];
  observerCount?: number;
  lang?: Lang;
  manualMitigations?: Record<string, { applicable?: boolean; robustness?: string | null }> | null;
}) => {
  const dimensionIndex = firstLimitIndex(GRC_DIMENSION_LIMITS, characteristicDimensionM);
  const speedIndex = firstLimitIndex(GRC_SPEED_LIMITS, maxSpeedMps);
  const popIndex = populationClassIndex(populationDensityValue);
  const igrc = weightKg !== null && weightKg <= 0.25 && maxSpeedMps <= 25 && popIndex < 4
    ? 1
    : GRC_MATRIX[dimensionIndex][speedIndex][popIndex];
  const controlledGroundMinimum = GRC_MATRIX[dimensionIndex][speedIndex][0];

  const parachuteEvidence = assignedEquipment.find((e: any) => {
    const text = `${e?.navn ?? ''} ${e?.type ?? ''} ${e?.beskrivelse ?? ''}`.toLowerCase();
    return /fallskjerm|parachute|moc\s*2512|dvr|design verification/.test(text);
  });
  const parachuteText = parachuteEvidence
    ? `${parachuteEvidence.navn ?? parachuteEvidence.type ?? 'Dokumentert energi-/fallskjermsystem'}`.toLowerCase()
    : '';
  const m2Reduction = parachuteText.includes('dvr') || parachuteText.includes('design verification')
    ? -2
    : parachuteEvidence && /fallskjerm|parachute|moc\s*2512/.test(parachuteText)
      ? -1
      : 0;
  // SORA robustness matrix (null = N/A for that mitigation)
  const MITIGATION_MATRIX: Record<string, Record<string, number | null>> = {
    m1a_sheltering: { None: 0, Low: -1, Medium: -2, High: null },
    m1b_operational_restrictions: { None: 0, Low: null, Medium: null, High: null },
    m1c_ground_observation: { None: 0, Low: -1, Medium: null, High: null },
    m2_impact_reduction: { None: 0, Low: null, Medium: -1, High: -2 },
  };
  const normalizeRobustness = (value?: string | null): string => {
    const v = String(value ?? '').toLowerCase();
    if (v.startsWith('high') || v.startsWith('høy')) return 'High';
    if (v.startsWith('med')) return 'Medium';
    if (v.startsWith('low') || v.startsWith('lav')) return 'Low';
    return 'None';
  };

  const observers = Number.isFinite(Number(observerCount)) ? Math.max(0, Math.trunc(Number(observerCount))) : 0;
  const m1cAutoReduction = observers > 0 ? -1 : 0;

  const manualEntries = manualMitigations && typeof manualMitigations === 'object' ? manualMitigations : null;
  const manualReduction = (key: string): number | null => {
    if (!manualEntries) return null;
    const entry = (manualEntries as any)[key];
    if (!entry) return null;
    if (!entry.applicable) return 0;
    return MITIGATION_MATRIX[key]?.[normalizeRobustness(entry.robustness)] ?? 0;
  };

  const effective = {
    m1a_sheltering: manualReduction('m1a_sheltering') ?? 0,
    m1b_operational_restrictions: manualReduction('m1b_operational_restrictions') ?? 0,
    m1c_ground_observation: manualReduction('m1c_ground_observation') ?? m1cAutoReduction,
    m2_impact_reduction: manualReduction('m2_impact_reduction') ?? m2Reduction,
  };
  const totalReduction = Object.values(effective).reduce((sum, r) => sum + r, 0);
  const fgrc = Math.max(controlledGroundMinimum, igrc + totalReduction);
  const dimensionClass = `≤${GRC_DIMENSION_LIMITS[dimensionIndex]} m`;
  const speedClass = `≤${GRC_SPEED_LIMITS[speedIndex]} m/s`;
  const populationBand = derivePopulationDensityBand(populationDensityValue, lang);

  const fmt = (v: number, d = 0) => formatLocaleNumber(v, d, lang);
  const en = lang === 'en';

  const outsideSoraNote = igrc > 7
    ? (en
        ? ' iGRC exceeds 7 and is outside the ordinary SORA matrix; this requires a special/certified assessment.'
        : ' iGRC er over 7 og ligger utenfor ordinær SORA-matrise; dette krever særskilt/sertifisert vurdering.')
    : '';

  const footprintFallback = en
    ? 'Planned route with operational volume and ground risk buffer.'
    : 'Planlagt rute med operasjonsvolum og bakkerisikobuffer.';
  const grcCalcMethod = en
    ? 'System-calculated using the fixed SORA iGRC matrix. AI output cannot modify iGRC/fGRC.'
    : 'Systemberegnet etter fast SORA iGRC-matrise. AI-output kan ikke endre iGRC/fGRC.';
  const tableBasis = en
    ? `Dimension class ${dimensionClass}, speed class ${speedClass}, population class ${populationBand}`
    : `Dimensjonsklasse ${dimensionClass}, hastighetsklasse ${speedClass}, befolkningsklasse ${populationBand}`;
  const igrcReasoning = en
    ? `System-calculated iGRC=${igrc} from the SORA table based on characteristic dimension ${fmt(characteristicDimensionM, 2)} m (${dimensionClass}), max speed ${fmt(maxSpeedMps, 1)} m/s (${speedClass}) and dimensioning SSB 250 m population density ${fmt(populationDensityValue)} people/km² (${populationBand}).${outsideSoraNote}`
    : `Systemberegnet iGRC=${igrc} fra SORA-tabellen basert på karakteristisk dimensjon ${fmt(characteristicDimensionM, 2)} m (${dimensionClass}), maks hastighet ${fmt(maxSpeedMps, 1)} m/s (${speedClass}) og dimensjonerende SSB 250 m-befolkningstetthet ${fmt(populationDensityValue)} personer/km² (${populationBand}).${outsideSoraNote}`;

  const m1aReason = en
    ? 'Not automatically credited. Sheltering requires documentation that exposed people are actually protected by structures.'
    : 'Ikke automatisk kreditert. Skjerming krever dokumentasjon på at eksponerte personer faktisk er beskyttet av strukturer.';
  const m1bReason = en
    ? 'Not automatically credited. Time/location restrictions must document approx. 90–99% reduction of exposed people.'
    : 'Ikke automatisk kreditert. Tid-/stedbegrensninger må dokumentere ca. 90–99 % reduksjon av eksponerte personer.';
  const m1cReason = observers > 0
    ? (en
        ? `Automatically credited (Low): ${observers} declared ground observer(s) monitor the overflown area and can alter the flight pattern.`
        : `Automatisk kreditert (Lav): ${observers} oppgitt(e) bakkeobservatør(er) overvåker overflyst område og kan endre flygemønster.`)
    : en
    ? 'Not automatically credited. Standard VLOS, pilot or airspace observer does not provide fGRC reduction without explicitly documented ground-based observation of the overflown area and the ability to alter the flight pattern.'
    : 'Ikke automatisk kreditert. Vanlig VLOS, pilot eller luftromsobservatør gir ikke fGRC-reduksjon uten eksplisitt dokumentert bakkebasert observasjon av overflyst område og evne til å endre flygemønster.';
  const m2NoEvidence = en
    ? 'No documented parachute, MoC 2512 or DVR-based energy/impact reduction found.'
    : 'Ingen dokumentert fallskjerm, MoC 2512 eller DVR-basert energi-/treffenergidemping funnet.';
  const m2WithEvidence = parachuteEvidence
    ? (en
        ? `Reduction based on documented equipment: ${parachuteEvidence?.navn ?? parachuteEvidence?.type}.`
        : `Reduksjon basert på dokumentert utstyr: ${parachuteEvidence?.navn ?? parachuteEvidence?.type}.`)
    : m2NoEvidence;

  const fgrcReasoning = totalReduction < 0
    ? (en
        ? `fGRC=${fgrc}: iGRC ${igrc} with documented reduction ${totalReduction}. The M1 limit is enforced so fGRC cannot fall below the controlled-ground-area value ${controlledGroundMinimum}.`
        : `fGRC=${fgrc}: iGRC ${igrc} med dokumentert reduksjon ${totalReduction}. M1-grensen er håndhevet slik at fGRC ikke kan bli lavere enn kontrollert-bakkeområde-verdien ${controlledGroundMinimum}.`)
    : (en
        ? `fGRC=${fgrc}: No documented GRC-reducing mitigations are credited, therefore fGRC equals iGRC. Observer/pilot does not automatically give -1 without explicit ground-based observation of the overflown area.`
        : `fGRC=${fgrc}: Ingen dokumenterte GRC-reduserende mitigeringer er kreditert, derfor er fGRC lik iGRC. Observatør/pilot gir ikke automatisk -1 uten eksplisitt bakkebasert observasjon av overflyst område.`);

  const defaultSource = en
    ? 'SSB population on 250 m grid (2025)'
    : 'SSB befolkning på rutenett 250 m (2025)';

  const manualReasonSuffix = en
    ? ' Manually selected by the operator.'
    : ' Manuelt valgt av operatøren.';
  const buildEntry = (
    key: string,
    autoApplicable: boolean,
    autoRobustness: string | null,
    autoReduction: number,
    reasoning: string,
  ) => {
    const manual = manualEntries ? (manualEntries as any)[key] : null;
    if (!manual) return { applicable: autoApplicable, robustness: autoRobustness, reduction: autoReduction, reasoning };
    const applicable = !!manual.applicable;
    const robustness = applicable ? normalizeRobustness(manual.robustness) : null;
    const reduction = applicable ? (MITIGATION_MATRIX[key]?.[robustness as string] ?? 0) : 0;
    return { applicable, robustness, reduction, reasoning: reasoning + manualReasonSuffix };
  };

  return {
    characteristic_dimension: `${fmt(characteristicDimensionM, 2)} m (${dimensionClass})`,
    max_speed_category: `${fmt(maxSpeedMps, 1)} m/s (${speedClass})`,
    drone_weight_kg: weightKg,
    population_density_band: populationBand,
    population_density_value: populationDensityValue,
    population_density_average: populationDensityAverage,
    population_density_calculation: populationData?.calculation ?? null,
    population_density_driver: populationData?.driver ?? null,
    population_density_source: populationData?.dataSource ?? defaultSource,
    population_density_footprint: populationData?.footprintDescription ?? footprintFallback,
    ssb_grid_population: populationData?.maxCellPopulation ?? null,
    ssb_grid_resolution_m: populationData?.gridResolutionM ?? 250,
    igrc,
    fgrc,
    total_reduction: fgrc - igrc,
    controlled_ground_area: populationDensityValue <= 0,
    controlled_ground_minimum: controlledGroundMinimum,
    mitigations_manual_override: !!manualEntries,
    grc_calculation_method: grcCalcMethod,
    igrc_table_basis: tableBasis,
    igrc_reasoning: igrcReasoning,
    mitigations: {
      m1a_sheltering: buildEntry('m1a_sheltering', false, null, 0, m1aReason),
      m1b_operational_restrictions: buildEntry('m1b_operational_restrictions', false, null, 0, m1bReason),
      m1c_ground_observation: buildEntry('m1c_ground_observation', m1cAutoReduction < 0, m1cAutoReduction < 0 ? 'Low' : null, m1cAutoReduction, m1cReason),
      m2_impact_reduction: buildEntry('m2_impact_reduction', m2Reduction < 0, m2Reduction === -2 ? 'High' : m2Reduction === -1 ? 'Medium' : null, m2Reduction, m2WithEvidence),
    },
    fgrc_reasoning: fgrcReasoning,
  };
};


const distanceMeters = (a: RouteCoord, b: RouteCoord): number => {
  const avgLat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const dx = (b.lng - a.lng) * metersPerDegLat * Math.cos(avgLat);
  const dy = (b.lat - a.lat) * metersPerDegLat;
  return Math.sqrt(dx * dx + dy * dy);
};

const distanceToSegmentMeters = (p: RouteCoord, a: RouteCoord, b: RouteCoord): number => {
  const avgLat = ((a.lat + b.lat + p.lat) / 3) * Math.PI / 180;
  const scaleLng = metersPerDegLat * Math.cos(avgLat);
  const px = p.lng * scaleLng, py = p.lat * metersPerDegLat;
  const ax = a.lng * scaleLng, ay = a.lat * metersPerDegLat;
  const bx = b.lng * scaleLng, by = b.lat * metersPerDegLat;
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const cx = ax + t * vx, cy = ay + t * vy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
};

const nearestRouteDriver = (p: RouteCoord, route: RouteCoord[], lang: Lang = 'no'): string => {
  const en = lang === 'en';
  const fallback = en ? 'within the operation footprint' : 'innenfor operasjonens fotavtrykk';
  const nearPoint = (n: number) => en ? `near route point P${n}` : `nær rutepunkt P${n}`;
  const nearSeg = (a: number, b: number) => en ? `near segment P${a}–P${b}` : `nær segment P${a}–P${b}`;
  const suffix = (dist: number) => en
    ? ` (${dist} m from SSB cell centre)`
    : ` (${dist} m fra senter av SSB-ruten)`;

  if (route.length === 0) return fallback;
  if (route.length === 1) return nearPoint(1);
  let best = { distance: Infinity, label: fallback };
  route.forEach((point, index) => {
    const d = distanceMeters(p, point);
    if (d < best.distance) best = { distance: d, label: nearPoint(index + 1) };
  });
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegmentMeters(p, route[i], route[i + 1]);
    if (d < best.distance) best = { distance: d, label: nearSeg(i + 1, i + 2) };
  }
  return `${best.label}${suffix(Math.round(best.distance))}`;
};

// Point-in-polygon (ray casting) on lat/lng — adequate at cell scale.
const pointInRing = (p: RouteCoord, ring: RouteCoord[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lng;
    const yj = ring[j].lat, xj = ring[j].lng;
    const intersect = (yi > p.lat) !== (yj > p.lat) &&
      p.lng < ((xj - xi) * (p.lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

// True when a grid cell polygon actually intersects the buffered route corridor
// (the exact footprint rendered on the map), not just its centroid proximity.
const cellIntersectsRouteBuffer = (ring: RouteCoord[], route: RouteCoord[], bufferM: number): boolean => {
  if (ring.length < 3 || route.length < 1) return false;

  // 1) Any route vertex inside the cell → overlap.
  for (const point of route) {
    if (pointInRing(point, ring)) return true;
  }

  // 2) Any sampled point on the cell outline within bufferM of the route.
  const samples: RouteCoord[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  for (const sample of samples) {
    if (route.length === 1) {
      if (distanceMeters(sample, route[0]) <= bufferM) return true;
      continue;
    }
    for (let i = 0; i < route.length - 1; i++) {
      if (distanceToSegmentMeters(sample, route[i], route[i + 1]) <= bufferM) return true;
    }
  }
  return false;
};

// Exact SORA footprint radius from the route centerline. When the mission has no
// calculated SORA buffer we fall back to a sensible default corridor instead of
// inflating the search area.
const DEFAULT_POPULATION_BUFFER_M = 150;
const resolveFootprintBufferM = (fg: number, contingency: number, grb: number): number => {
  const hasSora = fg > 0 || grb > 0;
  if (!hasSora) return DEFAULT_POPULATION_BUFFER_M;
  const sum = fg + contingency + grb;
  return sum > 0 ? sum : DEFAULT_POPULATION_BUFFER_M;
};

async function computeSsb250PopulationDensity(route: RouteCoord[], footprintBufferM: number, lang: Lang = 'no') {

  if (route.length < 2) return null;

  const avgLat = route.reduce((sum, p) => sum + p.lat, 0) / route.length;
  // Pad bbox by buffer + one cell size so partially overlapping cells are fetched.
  const bboxPadM = footprintBufferM + 300;
  const degLat = bboxPadM / metersPerDegLat;
  const degLng = bboxPadM / (metersPerDegLat * Math.cos(avgLat * Math.PI / 180));

  let minLat = Math.min(...route.map(p => p.lat)) - degLat;
  let maxLat = Math.max(...route.map(p => p.lat)) + degLat;
  let minLng = Math.min(...route.map(p => p.lng)) - degLng;
  let maxLng = Math.max(...route.map(p => p.lng)) + degLng;

  const wfsUrl = `https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett?service=WFS&version=1.1.0&request=GetFeature&typeNames=befolkning_250m_2025&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat}&maxFeatures=50000`;
  console.log(`Fetching SSB 250m population WFS for footprint: buffer=${footprintBufferM}m`);

  const resp = await fetch(wfsUrl, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`SSB 250m WFS ${resp.status}`);
  const gml = await resp.text();

  const cells: Array<{ population: number; centroid: RouteCoord; ring: RouteCoord[] }> = [];
  const memberRegex = /<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g;
  let match;
  while ((match = memberRegex.exec(gml)) !== null) {
    const block = match[1];
    const popMatch = block.match(/<ms:pop_tot>(\d+)<\/ms:pop_tot>/);
    const population = popMatch ? parseInt(popMatch[1], 10) : 0;
    if (population <= 0) continue;
    const posListMatch = block.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    if (!posListMatch) continue;
    const coords = posListMatch[1].trim().split(/\s+/).map(Number);
    const ring: RouteCoord[] = [];
    for (let i = 0; i < coords.length - 1; i += 2) {
      if (Number.isFinite(coords[i]) && Number.isFinite(coords[i + 1])) {
        ring.push({ lat: coords[i], lng: coords[i + 1] });
      }
    }
    if (ring.length === 0) continue;
    const sumLat = ring.reduce((s, p) => s + p.lat, 0);
    const sumLng = ring.reduce((s, p) => s + p.lng, 0);
    cells.push({
      population,
      centroid: { lat: sumLat / ring.length, lng: sumLng / ring.length },
      ring,
    });
  }

  // Overlap test against the EXACT footprint drawn on the map (buffered route
  // polyline). A cell counts only if its polygon actually intersects the buffer:
  // either a sampled point on the cell outline lies within footprintBufferM of
  // the route, or a route vertex lies inside the cell.
  const overlapping = cells.filter(cell => cellIntersectsRouteBuffer(cell.ring, route, footprintBufferM));
  if (overlapping.length === 0) return null;

  const maxCell = overlapping.reduce((best, cell) => cell.population > best.population ? cell : best, overlapping[0]);
  const totalPopulation = overlapping.reduce((sum, cell) => sum + cell.population, 0);
  const maxDensity = maxCell.population * 16;
  const avgDensity = totalPopulation / Math.max(overlapping.length * 0.0625, 0.0625);
  const driver = nearestRouteDriver(maxCell.centroid, route, lang);


  const en = lang === 'en';
  const fmt = (v: number, d = 0) => formatLocaleNumber(v, d, lang);

  return {
    maxDensity,
    avgDensity,
    cellCount: overlapping.length,
    maxCellPopulation: maxCell.population,
    totalPopulation,
    gridResolutionM: 250,
    dataSource: en ? 'SSB population on 250 m grid (2025)' : 'SSB befolkning på rutenett 250 m (2025)',
    method: en
      ? 'Highest overlapping 250 m cell is multiplied by 16 to obtain people/km².'
      : 'Høyeste overlappende 250 m-rute multipliseres med 16 for å beregne personer/km².',
    calculation: en
      ? `${fmt(maxCell.population)} people in dimensioning 250 m cell × 16 = ${fmt(Math.round(maxDensity))} people/km²`
      : `${fmt(maxCell.population)} personer i dimensjonerende 250 m-rute × 16 = ${fmt(Math.round(maxDensity))} personer/km²`,
    footprintDescription: en
      ? `Planned route + Flight Geography + Contingency + Ground Risk Buffer (${fmt(Math.round(footprintBufferM))} m from route).`
      : `Planlagt rute + Flight Geography + Contingency + Ground Risk Buffer (${fmt(Math.round(footprintBufferM))} m fra ruten).`,
    driver,
    driverCoordinate: maxCell.centroid,
  };
}

// Eurostat GEOSTAT 2021 v2 1 km grid population for missions outside Norway.
// Mirrors computeSsb250PopulationDensity output so downstream scoring/prompts
// can consume it identically. Uses the eurostat_pop_in_bbox RPC (GIST-indexed).
async function computeEurostatPopulationDensity(
  route: RouteCoord[],
  footprintBufferM: number,
  lang: Lang,
  supabase: any,
) {
  if (route.length < 2) return null;

  const avgLat = route.reduce((sum, p) => sum + p.lat, 0) / route.length;
  const bboxPadM = footprintBufferM + 1200;
  const degLat = bboxPadM / metersPerDegLat;
  const degLng = bboxPadM / (metersPerDegLat * Math.cos(avgLat * Math.PI / 180));
  const minLat = Math.min(...route.map(p => p.lat)) - degLat;
  const maxLat = Math.max(...route.map(p => p.lat)) + degLat;
  const minLng = Math.min(...route.map(p => p.lng)) - degLng;
  const maxLng = Math.max(...route.map(p => p.lng)) + degLng;

  console.log(`Fetching Eurostat 1km population for footprint: buffer=${footprintBufferM}m bbox=${minLng.toFixed(4)},${minLat.toFixed(4)},${maxLng.toFixed(4)},${maxLat.toFixed(4)}`);
  const { data, error } = await supabase.rpc('eurostat_pop_in_bbox', {
    min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat,
  });
  if (error) throw new Error(`eurostat_pop_in_bbox: ${error.message}`);

  const cells: Array<{ population: number; centroid: RouteCoord }> = (data ?? [])
    .map((r: any) => ({
      population: Number(r.pop_2021) || 0,
      centroid: { lat: Number(r.centroid_lat), lng: Number(r.centroid_lng) },
    }))
    .filter((c: any) => c.population > 0 && Number.isFinite(c.centroid.lat) && Number.isFinite(c.centroid.lng));

  // Reconstruct the 1 km cell square around each centroid and test true overlap
  // against the exact footprint (buffered route), same rule as the map.
  const cellRing = (c: RouteCoord): RouteCoord[] => {
    const dLat = 500 / metersPerDegLat;
    const dLng = 500 / (metersPerDegLat * Math.cos(c.lat * Math.PI / 180));
    return [
      { lat: c.lat - dLat, lng: c.lng - dLng },
      { lat: c.lat - dLat, lng: c.lng + dLng },
      { lat: c.lat + dLat, lng: c.lng + dLng },
      { lat: c.lat + dLat, lng: c.lng - dLng },
    ];
  };
  const overlapping = cells.filter(cell => cellIntersectsRouteBuffer(cellRing(cell.centroid), route, footprintBufferM));

  if (overlapping.length === 0) return null;

  const maxCell = overlapping.reduce((best, cell) => cell.population > best.population ? cell : best, overlapping[0]);
  const totalPopulation = overlapping.reduce((sum, cell) => sum + cell.population, 0);
  // 1 km² cell → people/km² == population count.
  const maxDensity = maxCell.population;
  const avgDensity = totalPopulation / overlapping.length;
  const driver = nearestRouteDriver(maxCell.centroid, route, lang);

  const en = lang === 'en';
  const fmt = (v: number, d = 0) => formatLocaleNumber(v, d, lang);

  return {
    maxDensity,
    avgDensity,
    cellCount: overlapping.length,
    maxCellPopulation: maxCell.population,
    totalPopulation,
    gridResolutionM: 1000,
    dataSource: en ? 'Eurostat GEOSTAT 2021 population on 1 km grid' : 'Eurostat GEOSTAT 2021 befolkning på 1 km rutenett',
    method: en
      ? 'Highest overlapping 1 km cell equals people/km² directly (1 km² cell size).'
      : 'Høyeste overlappende 1 km-rute tilsvarer personer/km² direkte (celle er 1 km²).',
    calculation: en
      ? `${fmt(maxCell.population)} people in dimensioning 1 km cell = ${fmt(Math.round(maxDensity))} people/km²`
      : `${fmt(maxCell.population)} personer i dimensjonerende 1 km-rute = ${fmt(Math.round(maxDensity))} personer/km²`,
    footprintDescription: en
      ? `Planned route + Flight Geography + Contingency + Ground Risk Buffer (${fmt(Math.round(footprintBufferM))} m from route).`
      : `Planlagt rute + Flight Geography + Contingency + Ground Risk Buffer (${fmt(Math.round(footprintBufferM))} m fra ruten).`,
    driver,
    driverCoordinate: maxCell.centroid,
  };
}



serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let prompts = getPrompts(undefined);

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error(prompts.errors.apiKeyMissing);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: prompts.errors.missingAuthHeader }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: prompts.errors.unauthorized }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { missionId, pilotInputs, droneId, soraReassessment, previousAnalysis, pilotComments, language, manualGroundMitigations, manualAirRisk, manualOverrides } = await req.json();
    console.log('[ai-risk-assessment] Received language from client:', JSON.stringify(language), '-> resolved:', getPrompts(language) === getPrompts('en') ? 'en' : 'no');
    prompts = getPrompts(language);

    if (!missionId) {
      return new Response(JSON.stringify({ error: prompts.errors.missionIdRequired }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // ---- Concurrency gate + job tracking (Phase 2) ----
    const { data: gateProfile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const gateCompanyId = gateProfile?.company_id ?? null;

    const MAX_CONCURRENT_PER_COMPANY = 3;
    let estimatedEtaMs = 45000;
    try {
      const { data: etaData } = await supabase.rpc('get_ai_risk_eta_ms');
      if (typeof etaData === 'number' && etaData > 0) estimatedEtaMs = etaData;
    } catch (_) { /* ignore */ }

    if (gateCompanyId) {
      const { count: runningCount } = await supabase
        .from('ai_risk_assessment_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', gateCompanyId)
        .eq('status', 'running')
        .gte('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

      if ((runningCount ?? 0) >= MAX_CONCURRENT_PER_COMPANY) {
        return new Response(JSON.stringify({
          error: 'Too many concurrent AI risk assessments for your company. Please wait a moment and try again.',
          retryAfterMs: estimatedEtaMs,
          estimatedEtaMs,
          status: 'queued',
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(estimatedEtaMs / 1000)) },
        });
      }
    }

    const jobStart = Date.now();
    const { data: jobRow } = await supabase
      .from('ai_risk_assessment_jobs')
      .insert({
        mission_id: missionId,
        company_id: gateCompanyId,
        user_id: user.id,
        status: 'running',
      })
      .select('id')
      .single();
    const jobId: string | null = jobRow?.id ?? null;

    const finishJob = async (status: 'done' | 'failed', errorMessage?: string) => {
      if (!jobId) return;
      try {
        await supabase.from('ai_risk_assessment_jobs').update({
          status,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - jobStart,
          error_message: errorMessage ?? null,
        }).eq('id', jobId);
      } catch (e) { console.error('finishJob error', e); }
    };
    // ---- End Phase 2 gate ----

    console.log(`Starting risk assessment for mission ${missionId}${soraReassessment ? ' (SORA re-assessment)' : ''}`);

    // Handle SORA re-assessment mode
    if (soraReassessment && previousAnalysis && pilotComments) {
      const soraLang = normalizeLang(language);
      console.log('[ai-risk-assessment/SORA] Running SORA re-assessment with pilot comments, language:', soraLang);

      const soraSystemPrompt = buildSoraReassessSystemPrompt(soraLang);
      const soraUserPrompt = buildSoraReassessUserPrompt(soraLang, previousAnalysis, pilotComments, manualOverrides ?? null);


      const soraAiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: soraSystemPrompt },
            { role: 'user', content: soraUserPrompt },
          ],
        }),
      });

      if (!soraAiResponse.ok) {
        const errorText = await soraAiResponse.text();
        console.error('SORA AI gateway error:', soraAiResponse.status, errorText);
        if (soraAiResponse.status === 429) {
          return new Response(JSON.stringify({ error: prompts.errors.rateLimited }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (soraAiResponse.status === 402) {
          return new Response(JSON.stringify({ error: prompts.errors.creditsExhausted }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI gateway error: ${soraAiResponse.status}`);
      }

      const soraAiData = await soraAiResponse.json();
      let soraContent = soraAiData.choices?.[0]?.message?.content;
      if (!soraContent) throw new Error('No content in SORA AI response');

      soraContent = soraContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let soraAnalysis;
      try {
        soraAnalysis = JSON.parse(soraContent);
      } catch (e) {
        console.error('Failed to parse SORA AI response:', soraContent);
        throw new Error('Invalid SORA AI response format');
      }

      // Deterministic SAIL lookup — override AI's value to keep result consistent with the matrix
      try {
        const SAIL_MATRIX: Record<string, Record<string, string>> = {
          '2': { a: 'I', b: 'II', c: 'IV', d: 'VI' },
          '3': { a: 'II', b: 'II', c: 'IV', d: 'VI' },
          '4': { a: 'III', b: 'III', c: 'IV', d: 'VI' },
          '5': { a: 'IV', b: 'IV', c: 'IV', d: 'VI' },
          '6': { a: 'V', b: 'V', c: 'V', d: 'VI' },
          '7': { a: 'VI', b: 'VI', c: 'VI', d: 'VI' },
        };
        const parseFgrc = (v: unknown): number | null => {
          if (typeof v === 'number') return Math.floor(v);
          if (typeof v === 'string') {
            const m = v.match(/\d+/);
            if (m) return parseInt(m[0], 10);
          }
          return null;
        };
        const parseArc = (v: unknown): string | null => {
          if (typeof v !== 'string') return null;
          const s = v.toLowerCase();
          const m = s.match(/arc[\s_-]*([abcd])/) ?? s.match(/^\s*([abcd])\s*$/);
          return m ? m[1] : null;
        };
        const mo = (manualOverrides as any) ?? null;
        const manualGround = (previousAnalysis as any)?.ground_risk_analysis;
        const groundOverridden = manualGround?.mitigations_manual_override === true || mo?.ground_manual_override === true;
        const manualFgrc = groundOverridden ? (parseFgrc(manualGround?.fgrc) ?? parseFgrc(mo?.fgrc)) : null;
        const fgrcRaw = manualFgrc ?? parseFgrc(soraAnalysis.sail_lookup?.fgrc_used) ?? parseFgrc(soraAnalysis.fgrc);
        if (manualFgrc !== null) {
          soraAnalysis.fgrc = manualFgrc;
          soraAnalysis.igrc = manualGround?.igrc ?? mo?.igrc ?? soraAnalysis.igrc;
        }
        const manualAir = (manualAirRisk as any)
          ?? (mo?.air_manual_override === true
            ? {
                arc_manual_override: true,
                arc_a_atypical: mo?.arc_a_atypical === true,
                manual_density_rating: mo?.manual_density_rating ?? null,
                aec: mo?.aec ?? null,
                residual_arc: mo?.residual_arc ?? null,
              }
            : null);
        // Manual ARC: use the explicit residual ARC when sent, otherwise re-derive it
        // from the operator's declaration (atypical) or Annex C table 2 density rating.
        let manualArcResidual: string | null = null;
        if (manualAir?.arc_manual_override === true) {
          manualArcResidual = parseArc(manualAir.residual_arc);
          if (!manualArcResidual && manualAir.arc_a_atypical === true) manualArcResidual = 'a';
          if (!manualArcResidual && manualAir.manual_density_rating != null) {
            const aecNum = parseFgrc(manualAir.aec ?? (previousAnalysis as any)?.air_risk_analysis?.aec);
            if (aecNum !== null) {
              manualArcResidual = parseArc(residualArcForDensity(aecNum, manualAir.manual_density_rating));
            }
          }
          if (!manualArcResidual) {
            manualArcResidual = parseArc((previousAnalysis as any)?.air_risk_analysis?.residual_arc)
              ?? parseArc((previousAnalysis as any)?.air_risk_analysis?.initial_arc);
          }
        }
        const arc = manualArcResidual ?? parseArc(soraAnalysis.sail_lookup?.arc_used) ?? parseArc(soraAnalysis.arc_residual);
        if (manualArcResidual) {
          soraAnalysis.arc_residual = `ARC-${manualArcResidual}`;
        }

        if (fgrcRaw !== null && arc) {
          const rowKey = fgrcRaw <= 2 ? '2' : String(Math.min(fgrcRaw, 7));
          const computed = SAIL_MATRIX[rowKey]?.[arc];
          if (computed) {
            const aiSail = soraAnalysis.sail;
            soraAnalysis.sail = `SAIL ${computed}`;
            soraAnalysis.sail_lookup = {
              ...(soraAnalysis.sail_lookup || {}),
              fgrc_used: fgrcRaw,
              arc_used: arc,
              result: computed,
            };
            if (soraAnalysis.containment && typeof soraAnalysis.containment === 'object') {
              const robustness = (computed === 'I' || computed === 'II')
                ? 'Low'
                : (computed === 'III' || computed === 'IV') ? 'Medium' : 'High';
              soraAnalysis.containment.robustness_level = robustness;
            }
            if (aiSail && aiSail !== soraAnalysis.sail) {
              console.log(`SAIL overridden: AI said "${aiSail}" → matrix says "${soraAnalysis.sail}" (fGRC=${fgrcRaw}, ARC=${arc})`);
            }
          }
        }
      } catch (e) {
        console.error('SAIL post-processing failed:', e);
      }

      // Manual overrides must also be reflected in the narrative text — the AI
      // otherwise keeps writing "no reduction credited" while the numbers show one.
      try {
        const mo2 = (manualOverrides as any) ?? null;
        const ga = (previousAnalysis as any)?.ground_risk_analysis;
        const aa = (previousAnalysis as any)?.air_risk_analysis;
        const en = normalizeLang(language) === 'en';
        const groundManual = ga?.mitigations_manual_override === true || mo2?.ground_manual_override === true;
        const airManual = aa?.arc_manual_override === true || mo2?.air_manual_override === true;

        if (groundManual) {
          const mits: any[] = (Array.isArray(ga?.mitigations) ? ga.mitigations : (mo2?.mitigations ?? [])) || [];
          const applied = mits.filter((m) => m?.applied === true || m?.selected === true);
          const list = applied
            .map((m) => `${m?.name ?? m?.title ?? m?.id ?? 'M?'}${m?.robustness ?? m?.robustness_level ? ` (${m.robustness ?? m.robustness_level})` : ''}`)
            .join(', ');
          const igrcTxt = ga?.igrc ?? mo2?.igrc ?? soraAnalysis.igrc;
          const fgrcTxt = soraAnalysis.fgrc;
          soraAnalysis.ground_mitigations = en
            ? (applied.length
                ? `Manually selected by the operator: ${list}. These mitigations are credited manually, which takes iGRC ${igrcTxt} to fGRC ${fgrcTxt}. The selection must be documented and accepted by the authority.`
                : `The operator manually confirmed that no GRC-reducing mitigations are credited. fGRC is set manually to ${fgrcTxt}.`)
            : (applied.length
                ? `Manuelt valgt av operatør: ${list}. Disse mitigeringene er kreditert manuelt, noe som tar iGRC ${igrcTxt} til fGRC ${fgrcTxt}. Valget må dokumenteres og aksepteres av myndighet.`
                : `Operatøren har manuelt bekreftet at ingen GRC-reduserende mitigeringer krediteres. fGRC er satt manuelt til ${fgrcTxt}.`);
        }

        if (airManual) {
          const iarc = aa?.initial_arc ?? mo2?.initial_arc ?? soraAnalysis.arc_initial;
          const rarc = soraAnalysis.arc_residual;
          const atypical = aa?.arc_a_atypical === true || mo2?.arc_a_atypical === true;
          const density = aa?.manual_density_rating ?? mo2?.manual_density_rating ?? null;
          const just = aa?.arc_reduction_justification ?? mo2?.arc_reduction_justification ?? null;
          const reason = en
            ? (atypical
                ? 'the operator has declared atypical/segregated airspace (AEC 12), which gives ARC-a per Annex C. This is a declaration, not a table reduction, and requires the requirements of Annex G section 3.20(d) to be met and documented'
                : density != null
                  ? `the operator has documented a lower local air traffic density (density rating ${density}) and applied the reduction in Annex C, table 2`
                  : 'the operator has manually set the residual ARC')
            : (atypical
                ? 'operatøren har erklært atypisk/segregert luftrom (AEC 12), som gir ARC-a etter Annex C. Dette er en erklæring, ikke en tabellreduksjon, og krever at kravene i Annex G seksjon 3.20(d) er oppfylt og dokumentert'
                : density != null
                  ? `operatøren har dokumentert lavere lokal lufttrafikktetthet (tetthetsrating ${density}) og anvendt reduksjonen i Annex C, tabell 2`
                  : 'operatøren har satt residual ARC manuelt');
          soraAnalysis.airspace_mitigations = en
            ? `Initial ARC is ${iarc}. Residual ARC is manually set to ${rarc} because ${reason}.${just ? ` Operator documentation: ${just}` : ''} The reduction must be documented and approved by the CAA before it can be relied on.`
            : `Initiell ARC er ${iarc}. Residual ARC er manuelt satt til ${rarc} fordi ${reason}.${just ? ` Operatørens dokumentasjon: ${just}` : ''} Reduksjonen må dokumenteres og godkjennes av Luftfartstilsynet før den kan legges til grunn.`;
        }

        if ((groundManual || airManual) && typeof soraAnalysis.summary === 'string') {
          const note = en
            ? ' Note: fGRC and/or ARC in this assessment are manually overridden by the operator and must be documented.'
            : ' Merk: fGRC og/eller ARC i denne vurderingen er manuelt overstyrt av operatøren og må dokumenteres.';
          if (!/manuelt overstyrt|manually overridden/i.test(soraAnalysis.summary)) {
            soraAnalysis.summary = `${soraAnalysis.summary}${note}`;
          }
        }
      } catch (e) {
        console.error('Manual-override narrative sync failed:', e);
      }

      // Anti-hallucination guard: scrub fabricated drone models / crew claims when
      // there is no grounding in previousAnalysis or substantive pilot comments.
      try {
        const ACK_ONLY_RE = /^(ok(ay)?|ja|nei|greit|fint|bra|yes|no|fine|good|n\/a|na|none|ingen( kommentar)?|none provided|no comment|\.|-)$/i;
        const isAck = (v: unknown) => {
          const s = typeof v === 'string' ? v.trim() : '';
          return !s || ACK_ONLY_RE.test(s);
        };
        const commentsObj = (pilotComments && typeof pilotComments === 'object') ? pilotComments as Record<string, unknown> : {};
        const substantiveText = Object.entries(commentsObj)
          .filter(([, v]) => !isAck(v))
          .map(([, v]) => String(v))
          .join('\n');

        const prevPrimary = (previousAnalysis as any)?.primaryDrone;
        const prevAssigned = (previousAnalysis as any)?.assignedDrones;
        const knownDroneModels: string[] = [];
        if (prevPrimary?.model) knownDroneModels.push(String(prevPrimary.model));
        if (Array.isArray(prevAssigned)) {
          for (const d of prevAssigned) {
            if (d?.model) knownDroneModels.push(String(d.model));
          }
        }
        const normalizedKnown = knownDroneModels.map(m => m.toLowerCase());
        const hasKnownDrone = normalizedKnown.length > 0;

        const DRONE_BRAND_RE = /\b(DJI|Autel|Parrot|Skydio|Yuneec|Mavic|Phantom|Matrice|Anafi|Inspire|Air ?2S?|Mini \d|M\d{2,3}[A-Z]*)\b/gi;
        const scrub = (text: unknown): unknown => {
          if (typeof text !== 'string') return text;
          let out = text;
          const matches = text.match(DRONE_BRAND_RE) || [];
          for (const m of matches) {
            const ml = m.toLowerCase();
            const inKnown = normalizedKnown.some(k => k.includes(ml) || ml.includes(k));
            const inComments = substantiveText.toLowerCase().includes(ml);
            if (!inKnown && !inComments) {
              out = out.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'primærdrone ikke spesifisert');
            }
          }
          return out;
        };

        const scrubKeys = ['summary', 'conops_summary', 'ground_mitigations', 'airspace_mitigations', 'residual_risk_comment', 'operational_limits'];
        for (const k of scrubKeys) {
          if (soraAnalysis[k]) soraAnalysis[k] = scrub(soraAnalysis[k]);
        }
        if (soraAnalysis.containment?.fts_note) {
          soraAnalysis.containment.fts_note = scrub(soraAnalysis.containment.fts_note);
        }

        // If the initial equipment category had a red/hard-stop and the equipment
        // comment is acknowledgement-only, do not allow SORA to upgrade to "go".
        const initEquip = (previousAnalysis as any)?.categories?.equipment;
        const equipWasRed = initEquip?.status === 'red' || initEquip?.go_decision === 'NO-GO' || initEquip?.go_decision === 'BETINGET';
        const equipCommentAck = isAck(commentsObj['equipment']);
        if (equipWasRed && equipCommentAck && soraAnalysis.recommendation === 'go') {
          console.log('Anti-hallucination guard: forcing recommendation down from "go" because equipment was red and comment is ack-only');
          soraAnalysis.recommendation = 'caution';
          if (typeof soraAnalysis.summary === 'string') {
            soraAnalysis.summary = `Merk: Opprinnelig utstyrsvurdering var rød/betinget og kommentaren ga ingen ny mitigering. Anbefaling nedjustert. ${soraAnalysis.summary}`;
          }
        }

        // If primary drone was missing in previousAnalysis, force a note in summary.
        if (!hasKnownDrone && typeof soraAnalysis.summary === 'string' && !/primærdrone ikke spesifisert/i.test(soraAnalysis.summary)) {
          soraAnalysis.summary = `${soraAnalysis.summary} Merk: primærdrone er ikke spesifisert i oppdraget.`;
        }
      } catch (e) {
        console.error('Anti-hallucination guard failed (non-blocking):', e);
      }

      console.log('SORA analysis complete:', soraAnalysis.sail, soraAnalysis.residual_risk_level);

      const soraOverallScore = normalizeRiskScore(soraAnalysis.overall_score) ?? normalizeRiskScore(previousAnalysis.overall_score);
      if (soraOverallScore !== null) {
        soraAnalysis.overall_score = soraOverallScore;
      }
      soraAnalysis.recommendation = deriveRiskRecommendation(
        soraOverallScore,
        soraAnalysis.hard_stop_triggered === true,
        previousAnalysis.recommendation
      );

      // Get user's profile for company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      const companyId = profile?.company_id;

      // Save SORA output to mission_risk_assessments
      const { data: savedAssessment, error: saveError } = await supabase
        .from('mission_risk_assessments')
        .insert({
          mission_id: missionId,
          pilot_id: user.id,
          company_id: companyId,
          weather_score: previousAnalysis.categories?.weather?.score || null,
          airspace_score: previousAnalysis.categories?.airspace?.score || null,
          pilot_experience_score: previousAnalysis.categories?.pilot_experience?.score || null,
          mission_complexity_score: previousAnalysis.categories?.mission_complexity?.score || null,
          equipment_score: previousAnalysis.categories?.equipment?.score || null,
          overall_score: soraOverallScore ?? previousAnalysis.overall_score,
          recommendation: soraAnalysis.recommendation,
          ai_analysis: previousAnalysis,
          pilot_comments: pilotComments,
          sora_output: soraAnalysis,
        })
        .select()
        .single();

      if (saveError) {
        console.error('Save SORA assessment error:', saveError);
      }

      // Upsert to mission_sora table
      if (companyId) {
        const { error: soraUpsertError } = await supabase
          .from('mission_sora')
          .upsert({
            mission_id: missionId,
            company_id: companyId,
            environment: soraAnalysis.environment || null,
            conops_summary: soraAnalysis.conops_summary || null,
            igrc: soraAnalysis.igrc || null,
            ground_mitigations: soraAnalysis.ground_mitigations || null,
            fgrc: soraAnalysis.fgrc || null,
            arc_initial: soraAnalysis.arc_initial || null,
            airspace_mitigations: soraAnalysis.airspace_mitigations || null,
            arc_residual: soraAnalysis.arc_residual || null,
            sail: soraAnalysis.sail || null,
            residual_risk_level: soraAnalysis.residual_risk_level || null,
            residual_risk_comment: soraAnalysis.residual_risk_comment || null,
            operational_limits: soraAnalysis.operational_limits || null,
            sora_status: 'Under arbeid',
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
          }, { onConflict: 'mission_id', ignoreDuplicates: false });

        if (soraUpsertError) {
          console.error('SORA upsert error:', soraUpsertError);
        } else {
          console.log('SORA data synced to mission_sora table');
        }
      }

      await finishJob('done');
      return new Response(JSON.stringify({
        success: true,
        assessment: savedAssessment,
        soraAnalysis,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch mission data with related entities
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*, mission_sora(*), customers(*)')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      console.error('Mission fetch error:', missionError);
      return new Response(JSON.stringify({ error: prompts.errors.missionNotFound }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch assigned personnel for the mission
    // GDPR: Only fetch non-personal data needed for risk assessment (no names, email, phone)
    const { data: missionPersonnel, error: missionPersonnelError } = await supabase
      .from('mission_personnel')
      .select('profile_id, profiles(id, flyvetimer, tittel)')
      .eq('mission_id', missionId);

    if (missionPersonnelError) {
      console.error('Mission personnel fetch error:', missionPersonnelError);
    }

    const assignedPilots = missionPersonnel?.map((mp: any) => mp.profiles).filter(Boolean) || [];
    console.log(`Found ${assignedPilots.length} assigned personnel for mission`);
    if ((missionPersonnel?.length || 0) > 0 && assignedPilots.length === 0) {
      console.log('mission_personnel rows exist, but joined profiles were empty. Sample row:', missionPersonnel?.[0]);
    }
    // 3. Fetch assigned drones for the mission
    const { data: missionDrones } = await supabase
      .from('mission_drones')
      .select('drone_id, drones(*)')
      .eq('mission_id', missionId);

    const assignedDrones = missionDrones?.map(md => md.drones).filter(Boolean) || [];
    console.log(`Found ${assignedDrones.length} assigned drones for mission`);

    // 4. Fetch assigned equipment for the mission
    const { data: missionEquipment } = await supabase
      .from('mission_equipment')
      .select('equipment_id, equipment(*)')
      .eq('mission_id', missionId);

    const assignedEquipment = missionEquipment?.map(me => me.equipment).filter(Boolean) || [];
    console.log(`Found ${assignedEquipment.length} assigned equipment for mission`);

    // 5. Get current user's profile and company
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const companyId = profile?.company_id;

    // 6. Fetch competencies for all assigned pilots
    const pilotIds = assignedPilots.map((p: any) => p.id);
    let allCompetencies: any[] = [];
    if (pilotIds.length > 0) {
      const { data: competencies } = await supabase
        .from('personnel_competencies')
        .select('*')
        .in('profile_id', pilotIds);
      allCompetencies = competencies || [];
    }

    // 7. Fetch flight logs for assigned pilots
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Hent flyturer via flight_log_personnel-junctionen (én sannhetskilde for pilot-tilskrivning).
    // user_id på flight_logs er den som lastet opp loggen, ikke nødvendigvis piloten.
    let allFlightLogs: any[] = [];
    const logToPilotIds = new Map<string, string[]>();
    if (pilotIds.length > 0) {
      const { data: flpRows } = await supabase
        .from('flight_log_personnel')
        .select('flight_log_id, profile_id')
        .in('profile_id', pilotIds);

      const flightLogIds = Array.from(new Set((flpRows || []).map((r: any) => r.flight_log_id)));
      for (const row of flpRows || []) {
        const arr = logToPilotIds.get(row.flight_log_id) || [];
        arr.push(row.profile_id);
        logToPilotIds.set(row.flight_log_id, arr);
      }

      if (flightLogIds.length > 0) {
        const { data: flightLogs } = await supabase
          .from('flight_logs')
          .select('*')
          .in('id', flightLogIds)
          .order('flight_date', { ascending: false });
        allFlightLogs = flightLogs || [];
      }
    }

    // Build flight stats per pilot
    const pilotFlightStats = pilotIds.map((pilotId: string) => {
      const pilotLogs = allFlightLogs.filter(log => (logToPilotIds.get(log.id) || []).includes(pilotId));
      return {
        pilotId,
        totalFlights: pilotLogs.length,
        totalMinutes: pilotLogs.reduce((sum, log) => sum + (log.flight_duration_minutes || 0), 0),
        last30Days: pilotLogs.filter(log => new Date(log.flight_date) >= thirtyDaysAgo).length,
        last90Days: pilotLogs.filter(log => new Date(log.flight_date) >= ninetyDaysAgo).length,
        lastFlightDate: pilotLogs[0]?.flight_date || null,
      };
    });

    // 8. Fetch weather data if coordinates available and not skipped
    let weatherData = null;
    const routeCoords = (mission.route as any)?.coordinates;
    // Oppdrag kan ha flere ruter. Risikovurderingen bruker worst case på tvers
    // av alle rutene (luftrom, arealbruk og befolkningstetthet).
    const routeSegmentsRaw: { label: string; coords: { lat: number; lng: number }[] }[] =
      Array.isArray((mission.route as any)?.routes) && (mission.route as any).routes.length > 0
        ? (mission.route as any).routes
            .map((r: any, i: number) => ({
              label: (r?.name && String(r.name).trim()) || `Rute ${i + 1}`,
              coords: Array.isArray(r?.coordinates) ? r.coordinates : [],
            }))
            .filter((s: any) => s.coords.length > 0)
        : (routeCoords && routeCoords.length > 0 ? [{ label: 'Rute 1', coords: routeCoords }] : []);
    const multiRoute = routeSegmentsRaw.length > 1;
    const allRouteCoords: { lat: number; lng: number }[] = routeSegmentsRaw.flatMap((s) => s.coords);
    const lat = mission.latitude ?? routeCoords?.[0]?.lat;
    const lng = mission.longitude ?? routeCoords?.[0]?.lng;

    
    const skipWeather = pilotInputs?.skipWeatherEvaluation === true;

    if (skipWeather) {
      console.log('Weather evaluation skipped by user request');
    } else {
      console.log(`Fetching weather for coordinates: lat=${lat}, lon=${lng}`);

      if (lat && lng) {
        try {
          const weatherResponse = await fetch(`${supabaseUrl}/functions/v1/drone-weather`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ lat, lon: lng }),
          });
          if (weatherResponse.ok) {
            weatherData = await weatherResponse.json();
            console.log(`Weather data fetched successfully: ${weatherData?.current?.temperature}°C, wind ${weatherData?.current?.wind_speed} m/s`);
          } else {
            console.error('Weather fetch failed:', weatherResponse.status, await weatherResponse.text());
          }
        } catch (e) {
          console.error('Weather fetch error:', e);
        }
      } else {
        console.log('No coordinates available for weather fetch');
      }
    }

    // 8b. Fetch solar/geomagnetic activity (Kp-index) from NOAA SWPC
    // Always provide an object so the AI prompt can include Kp consistently, even when unavailable.
    let solarActivity: { kpIndex: number | null; noaaScale: string; level: string } = {
      kpIndex: null,
      noaaScale: 'unknown',
      level: 'unavailable',
    };
    try {
      const kpRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', {
        signal: AbortSignal.timeout(5000),
      });
      if (kpRes.ok) {
        const kpRaw = await kpRes.json();
        // Format: [{ "time_tag": "2026-05-12T00:00:00", "kp": 0.67, "observed": "observed", "noaa_scale": null }, ...]
        if (!Array.isArray(kpRaw) || kpRaw.length === 0 || typeof kpRaw[0]?.kp !== 'number') {
          console.warn('NOAA Kp response unexpected shape, leaving kpIndex=null. Sample:', JSON.stringify(kpRaw?.[0] ?? kpRaw).slice(0, 200));
        } else {
          type KpRow = { time_tag: string; kp: number; observed?: string; noaa_scale?: string | null };
          const rows = kpRaw as KpRow[];
          const missionDateStr = mission.tidspunkt
            ? new Date(mission.tidspunkt).toISOString().substring(0, 10)
            : new Date().toISOString().substring(0, 10);
          let maxKp = 0;
          let matchedDate = false;
          for (const row of rows) {
            if (!row || typeof row.kp !== 'number' || !row.time_tag) continue;
            const rowDate = row.time_tag.substring(0, 10);
            if (rowDate === missionDateStr && row.kp > maxKp) {
              maxKp = row.kp;
              matchedDate = true;
            }
          }
          // Fallback to tomorrow if no data for mission date
          if (!matchedDate) {
            const tomorrow = new Date(missionDateStr);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().substring(0, 10);
            for (const row of rows) {
              if (!row || typeof row.kp !== 'number' || !row.time_tag) continue;
              const rowDate = row.time_tag.substring(0, 10);
              if ((rowDate === missionDateStr || rowDate === tomorrowStr) && row.kp > maxKp) {
                maxKp = row.kp;
                matchedDate = true;
              }
            }
          }
          // If still no match (mission far in future/past), fall back to most recent observed value
          if (!matchedDate) {
            for (const row of rows) {
              if (!row || typeof row.kp !== 'number') continue;
              if (row.kp > maxKp) maxKp = row.kp;
            }
          }
          const roundedKp = Math.round(maxKp * 10) / 10;
          let noaaScale = 'G0';
          let level = 'low';
          if (roundedKp >= 9) { noaaScale = 'G5'; level = 'extreme'; }
          else if (roundedKp >= 8) { noaaScale = 'G4'; level = 'severe'; }
          else if (roundedKp >= 7) { noaaScale = 'G3'; level = 'strong'; }
          else if (roundedKp >= 6) { noaaScale = 'G2'; level = 'moderate'; }
          else if (roundedKp >= 5) { noaaScale = 'G1'; level = 'minor'; }

          solarActivity = { kpIndex: roundedKp, noaaScale, level };
          console.log(`Solar activity: rows=${rows.length}, missionDate=${missionDateStr}, matched=${matchedDate}, Kp=${roundedKp}, scale=${noaaScale}, level=${level}`);
        }
      } else {
        console.warn('NOAA Kp fetch non-ok:', kpRes.status);
      }
    } catch (e) {
      console.error('Solar activity fetch error (non-blocking):', e);
    }

    // 9. Fetch airspace warnings (worst case across all routes)
    let airspaceWarnings: any[] = [];
    const airspaceRuns: { label: string | null; coords: { lat: number; lng: number }[] | null }[] =
      routeSegmentsRaw.length > 0
        ? routeSegmentsRaw.map((s) => ({ label: multiRoute ? s.label : null, coords: s.coords }))
        : [{ label: null, coords: null }];

    const mergeWarnings = (rows: any[], label: string | null) => {
      for (const row of rows || []) {
        const key = `${row.z_type}|${row.z_name}`;
        const existing = airspaceWarnings.find((w) => `${w.z_type}|${w.z_name}` === key);
        if (!existing) {
          airspaceWarnings.push({ ...row, route_labels: label ? [label] : [] });
          continue;
        }
        existing.route_inside = existing.route_inside || row.route_inside;
        if (typeof row.min_distance === 'number') {
          existing.min_distance = Math.min(existing.min_distance ?? row.min_distance, row.min_distance);
        }
        if (label && Array.isArray(existing.route_labels) && !existing.route_labels.includes(label)) {
          existing.route_labels.push(label);
        }
      }
    };

    if (lat && lng) {
      for (const run of airspaceRuns) {
        try {
          const { data: warnings, error: airspaceError } = await supabase.rpc('check_mission_airspace', {
            p_lat: lat,
            p_lng: lng,
            p_route: run.coords ? JSON.parse(JSON.stringify(run.coords)) : null,
          });
          if (airspaceError) {
            console.error('Airspace check RPC error:', airspaceError);
          } else {
            mergeWarnings(warnings || [], run.label);
          }
        } catch (e) {
          console.error('Airspace check error:', e);
        }
      }
      console.log(`Airspace warnings found (merged): ${airspaceWarnings.length}`);
    }


    // 9a. Unified europeisk luftrom (DK/SE/DE/FI) — ADDITIV, kun når ruten
    // ligger utenfor Norge OG selskapet står på allowlisten. Norske brukere
    // og norske ruter går aldri hit — check_mission_airspace (NO) er urørt.
    // Se .lovable/plan.md for begrunnelse og guardrails.
    const NORWAY_BBOX = { minLat: 57.5, maxLat: 71.5, minLng: 4.0, maxLng: 31.5 };
    const centroidInNorway = (() => {
      const pts = (allRouteCoords.length > 0)
        ? allRouteCoords
        : (lat && lng ? [{ lat, lng }] : []);

      if (pts.length === 0) return true; // Ingen koordinater -> ikke aktiver ny gren
      const cLat = pts.reduce((s, c) => s + c.lat, 0) / pts.length;
      const cLng = pts.reduce((s, c) => s + c.lng, 0) / pts.length;
      return cLat >= NORWAY_BBOX.minLat && cLat <= NORWAY_BBOX.maxLat
          && cLng >= NORWAY_BBOX.minLng && cLng <= NORWAY_BBOX.maxLng;
    })();

    let unifiedAirspaceActive = false;
    if (!centroidInNorway && (lat && lng) && companyId) {
      try {
        const { data: allow } = await supabase
          .from('airspace_unified_company_allowlist')
          .select('company_id')
          .eq('company_id', companyId)
          .maybeSingle();
        if (allow) {
          unifiedAirspaceActive = true;
          console.log(`Unified airspace enabled for company ${companyId} (route outside NO)`);
          const { data: unifiedWarnings, error: unifiedErr } = await supabase.rpc(
            'check_mission_airspace_unified',
            {
              p_lat: lat,
              p_lng: lng,
              p_route: routeCoords ? JSON.parse(JSON.stringify(routeCoords)) : null,
            },
          );
          if (unifiedErr) {
            console.error('Unified airspace RPC error:', unifiedErr);
          } else if (unifiedWarnings && unifiedWarnings.length > 0) {
            airspaceWarnings = [...airspaceWarnings, ...unifiedWarnings];
            console.log(`Unified airspace warnings added: ${unifiedWarnings.length}`);
          }
        }
      } catch (e) {
        console.error('Unified airspace check error (non-blocking):', e);
      }
    }



    // 9b. Fetch SSB Arealbruk (land use) data for ground risk classification
    // Norge-only datakilde (Geonorge WFS). For unified/europeisk gren settes
    // en tydelig coverage-note i stedet slik at AI ikke skriver "0 people/km²".
    let landUseData: { categories: string[]; groundRiskClassification: string; summary: string; featureCount: Record<string, number> } | null = null;
    if (unifiedAirspaceActive) {
      landUseData = {
        categories: [],
        featureCount: {},
        groundRiskClassification: 'unknown',
        summary: (language === 'en')
          ? 'Land-use data outside Norway is not integrated yet. Population density is derived from Eurostat GEOSTAT 2021 1 km grid (see population section) — verify local land use manually.'
          : 'Arealbruksdata utenfor Norge er ikke integrert ennå. Befolkningstetthet hentes fra Eurostat GEOSTAT 2021 1 km-rutenett (se befolkningsavsnitt) — verifiser lokal arealbruk manuelt.',
      };
    } else if (lat && lng) {

      try {
        // Build bounding box from route coordinates or single point
        const allCoords: { lat: number; lng: number }[] = routeCoords && routeCoords.length > 0
          ? routeCoords
          : [{ lat, lng }];

        // Get SORA ground risk buffer distance if available
        const soraData = mission.mission_sora?.[0];
        const bufferMeters = soraData?.ground_risk_distance
          ? (soraData.contingency_distance || 50) + soraData.ground_risk_distance
          : allCoords.length === 1 ? 500 : 200;

        // Calculate bounding box with buffer
        const degPerMeterLat = 1 / 111320;
        const avgLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
        const degPerMeterLng = 1 / (111320 * Math.cos(avgLat * Math.PI / 180));

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of allCoords) {
          if (c.lat < minLat) minLat = c.lat;
          if (c.lat > maxLat) maxLat = c.lat;
          if (c.lng < minLng) minLng = c.lng;
          if (c.lng > maxLng) maxLng = c.lng;
        }
        minLat -= bufferMeters * degPerMeterLat;
        maxLat += bufferMeters * degPerMeterLat;
        minLng -= bufferMeters * degPerMeterLng;
        maxLng += bufferMeters * degPerMeterLng;

        const wfsUrl = `https://wfs.geonorge.no/skwms1/wfs.arealbruk?service=WFS&version=2.0.0&request=GetFeature&typeName=app:SsbArealbrukFlate&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat},EPSG:4326&count=200`;
        console.log(`Fetching SSB Arealbruk WFS: bbox=${minLng.toFixed(5)},${minLat.toFixed(5)},${maxLng.toFixed(5)},${maxLat.toFixed(5)}`);

        const wfsResponse = await fetch(wfsUrl, { signal: AbortSignal.timeout(8000) });
        if (wfsResponse.ok) {
          const xmlText = await wfsResponse.text();
          
          // Parse XML/GML response using regex to extract land use categories
          const arealbrukMatches = [...xmlText.matchAll(/<app:arealbruksomrade>(.*?)<\/app:arealbruksomrade>/g)].map(m => m[1]);
          const bebyggelseMatches = [...xmlText.matchAll(/<app:bebyggelsestype>(.*?)<\/app:bebyggelsestype>/g)].map(m => m[1]);
          const allCategories = [...arealbrukMatches, ...bebyggelseMatches];
          console.log(`SSB Arealbruk: ${arealbrukMatches.length} features returned, categories: ${[...new Set(allCategories)].join(', ')}`);

          // Count categories
          const featureCount: Record<string, number> = {};
          for (const cat of arealbrukMatches) {
            featureCount[cat] = (featureCount[cat] || 0) + 1;
          }
          for (const cat of bebyggelseMatches) {
            const key = `Bebyggelse:${cat}`;
            featureCount[key] = (featureCount[key] || 0) + 1;
          }

          // Classify ground risk based on SSB categories
          const allCatsLower = allCategories.map(c => c.toLowerCase());
          const hasBolig = allCatsLower.some(c => c === 'bolig' || c === 'beb' || c === 'frittliggende' || c === 'rekkehus' || c === 'blokk');
          const hasOffentlig = allCatsLower.some(c => c === 'offentligprivattjenesteyting' || c === 'skole' || c === 'sykehus');
          const hasNaering = allCatsLower.some(c => c === 'naering' || c === 'handel');
          const hasIndustri = allCatsLower.some(c => c === 'industri' || c === 'lager');
          const hasTransport = allCatsLower.some(c => c === 'transporttelek' || c === 'annenveg' || c === 'jernbane');
          const hasFritid = allCatsLower.some(c => c === 'fritid' || c === 'idrett' || c === 'park');

          let groundRiskClassification = 'low';
          let summary = 'Området inneholder hovedsakelig ubebygde/fritidsområder med lav befolkningstetthet.';

          if (hasBolig || hasOffentlig) {
            groundRiskClassification = 'high';
            const types: string[] = [];
            if (hasBolig) types.push('boligområder');
            if (hasOffentlig) types.push('offentlige tjenester/institusjoner');
            if (hasNaering) types.push('næringsbebyggelse');
            summary = `Området inneholder ${types.join(', ')} — høy befolkningstetthet, forhøyet ground risk.`;
          } else if (hasNaering || hasIndustri || hasTransport) {
            groundRiskClassification = 'moderate';
            const types: string[] = [];
            if (hasNaering) types.push('næringsbebyggelse');
            if (hasIndustri) types.push('industri');
            if (hasTransport) types.push('transportinfrastruktur');
            summary = `Området inneholder ${types.join(', ')} — moderat befolkningstetthet.`;
          }

          landUseData = {
            categories: Object.keys(featureCount),
            groundRiskClassification,
            summary,
            featureCount,
          };
          console.log(`Land use classification: ${groundRiskClassification}`, JSON.stringify(featureCount));
        } else {
          console.error('SSB Arealbruk WFS failed:', wfsResponse.status);
        }
      } catch (e) {
        console.error('SSB Arealbruk fetch error (continuing without land use data):', e);
      }
    }

    // 9c. Fetch SSB 250m population density for the operational footprint (route + SORA buffers)
    let populationData: {
      maxDensity: number;
      avgDensity: number;
      cellCount: number;
      grcImpact: 'none' | 'moderate' | 'high' | 'very_high';
      grcIncrement: number;
      summary: string;
      maxCellPopulation?: number;
      totalPopulation?: number;
      gridResolutionM?: number;
      dataSource?: string;
      method?: string;
      calculation?: string;
      footprintDescription?: string;
      driver?: string;
      driverCoordinate?: { lat: number; lng: number };
    } | null = null;

    // Befolkningstetthet beregnes fra selve flyruten og SORA-fotavtrykket,
    // ikke fra oppdragets start-/lokasjonspunkt. Krev minst 2 rutepunkter.
    if (routeCoords && routeCoords.length >= 2 && !unifiedAirspaceActive) {
      try {
        const soraData = mission.mission_sora?.[0];
        const routeSora = (mission.route as any)?.soraSettings;
        const fg = Number(routeSora?.flightGeographyDistance ?? soraData?.flight_geography_distance ?? 0) || 0;
        const contingency = Number(routeSora?.contingencyDistance ?? soraData?.contingency_distance ?? 50) || 50;
        const grb = Number(routeSora?.groundRiskDistance ?? soraData?.ground_risk_distance ?? 0) || 0;
        const footprintBufferM = resolveFootprintBufferM(fg, contingency, grb);
        const computed = await computeSsb250PopulationDensity(routeCoords, footprintBufferM, resolveLang(language));

        if (computed) {
          const maxDensity = computed.maxDensity;
          let grcImpact: 'none' | 'moderate' | 'high' | 'very_high' = 'none';
          let grcIncrement = 0;
          if (maxDensity >= 1500) {
            grcImpact = 'very_high';
            grcIncrement = 2;
          } else if (maxDensity >= 500) {
            grcImpact = 'high';
            grcIncrement = 1;
          } else if (maxDensity >= 100) {
            grcImpact = 'moderate';
          }

          const summary = `SSB 250 m: ${computed.calculation}. Gjennomsnitt i fotavtrykket er ${computed.avgDensity.toFixed(1)} personer/km² basert på ${computed.cellCount} overlappende ruter. Dimensjonerende rute ligger ${computed.driver}.`;
          populationData = { ...computed, grcImpact, grcIncrement, summary };
          console.log(`Population data 250m: max=${maxDensity}, avg=${computed.avgDensity.toFixed(1)}, cells=${computed.cellCount}, driver=${computed.driver}`);
        } else {
          console.log('SSB 250m population: no overlapping populated cells found inside operational footprint');
          populationData = {
            maxDensity: 0,
            avgDensity: 0,
            cellCount: 0,
            grcImpact: 'none',
            grcIncrement: 0,
            summary: 'Ingen befolkede SSB 250 m-ruter ble funnet innenfor operasjonens fotavtrykk.',
            gridResolutionM: 250,
            dataSource: 'SSB befolkning på rutenett 250 m (2025)',
            method: 'Høyeste overlappende 250 m-rute multipliseres med 16 for å beregne personer/km².',
          };
        }
      } catch (e) {
        console.error('SSB 250m population fetch error (continuing without data):', e);
      }
    }

    // 9c-eu. Eurostat 1 km population density for missions outside Norway (allowlisted companies).
    if (routeCoords && routeCoords.length >= 2 && unifiedAirspaceActive) {
      try {
        const soraData = mission.mission_sora?.[0];
        const routeSora = (mission.route as any)?.soraSettings;
        const fg = Number(routeSora?.flightGeographyDistance ?? soraData?.flight_geography_distance ?? 0) || 0;
        const contingency = Number(routeSora?.contingencyDistance ?? soraData?.contingency_distance ?? 50) || 50;
        const grb = Number(routeSora?.groundRiskDistance ?? soraData?.ground_risk_distance ?? 0) || 0;
        const footprintBufferM = resolveFootprintBufferM(fg, contingency, grb);
        const computed = await computeEurostatPopulationDensity(routeCoords, footprintBufferM, resolveLang(language), supabase);

        if (computed) {
          const maxDensity = computed.maxDensity;
          let grcImpact: 'none' | 'moderate' | 'high' | 'very_high' = 'none';
          let grcIncrement = 0;
          if (maxDensity >= 1500) { grcImpact = 'very_high'; grcIncrement = 2; }
          else if (maxDensity >= 500) { grcImpact = 'high'; grcIncrement = 1; }
          else if (maxDensity >= 100) { grcImpact = 'moderate'; }

          const en = resolveLang(language) === 'en';
          const summary = en
            ? `Eurostat 1 km: ${computed.calculation}. Average density inside footprint is ${computed.avgDensity.toFixed(1)} people/km² across ${computed.cellCount} overlapping cells. Dimensioning cell is ${computed.driver}.`
            : `Eurostat 1 km: ${computed.calculation}. Gjennomsnitt i fotavtrykket er ${computed.avgDensity.toFixed(1)} personer/km² basert på ${computed.cellCount} overlappende ruter. Dimensjonerende rute ligger ${computed.driver}.`;
          populationData = { ...computed, grcImpact, grcIncrement, summary };
          console.log(`Eurostat population: max=${maxDensity}, avg=${computed.avgDensity.toFixed(1)}, cells=${computed.cellCount}`);
        } else {
          console.log('Eurostat 1km: no overlapping populated cells found inside operational footprint');
          const en = resolveLang(language) === 'en';
          populationData = {
            maxDensity: 0,
            avgDensity: 0,
            cellCount: 0,
            grcImpact: 'none',
            grcIncrement: 0,
            summary: en
              ? 'No populated Eurostat 1 km cells found inside the operation footprint.'
              : 'Ingen befolkede Eurostat 1 km-ruter ble funnet innenfor operasjonens fotavtrykk.',
            gridResolutionM: 1000,
            dataSource: en ? 'Eurostat GEOSTAT 2021 population on 1 km grid' : 'Eurostat GEOSTAT 2021 befolkning på 1 km rutenett',
            method: en
              ? 'Highest overlapping 1 km cell equals people/km² directly.'
              : 'Høyeste overlappende 1 km-rute tilsvarer personer/km² direkte.',
          };
        }
      } catch (e) {
        console.error('Eurostat population fetch error (continuing without data):', e);
      }
    }


    // 9d. Fetch company-specific SORA config
    // Inheritance rules:
    //   1) If parent exists AND parent.propagate_sora_config = true AND parent has
    //      a company_sora_config row -> use PARENT's config (overrides child).
    //   2) Else if child has own row -> use child's.
    //   3) Else fall back to parent's row if any.
    let companySoraConfig: any = null;
    let companySoraConfigSource: 'own' | 'parent-propagated' | 'parent-fallback' | 'none' = 'none';
    let linkedDocumentSummary = '';
    let companyRequireSora = false;
    const soraSelect = 'max_wind_speed_ms, max_wind_gust_ms, max_visibility_km, max_flight_altitude_m, require_backup_battery, require_observer, min_temp_c, max_temp_c, allow_bvlos, allow_night_flight, require_civil_twilight, max_pilot_inactivity_days, max_population_density_per_km2, operative_restrictions, policy_notes, linked_document_ids';
    if (companyId) {
      try {
        const { data: companyRow } = await supabase
          .from('companies')
          .select('parent_company_id, require_sora_on_missions')
          .eq('id', companyId)
          .maybeSingle();
        companyRequireSora = !!(companyRow as any)?.require_sora_on_missions;
        const parentId = (companyRow as any)?.parent_company_id ?? null;

        // Fetch own config
        const { data: ownConfig } = await supabase
          .from('company_sora_config' as any)
          .select(soraSelect)
          .eq('company_id', companyId)
          .maybeSingle();

        // Look at parent if there is one
        let parentPropagates = false;
        let parentConfig: any = null;
        if (parentId) {
          const { data: parentCompany } = await supabase
            .from('companies')
            .select('propagate_sora_config')
            .eq('id', parentId)
            .maybeSingle();
          parentPropagates = !!(parentCompany as any)?.propagate_sora_config;

          const { data: pCfg } = await supabase
            .from('company_sora_config' as any)
            .select(soraSelect)
            .eq('company_id', parentId)
            .maybeSingle();
          parentConfig = pCfg;
        }

        if (parentPropagates && parentConfig) {
          companySoraConfig = parentConfig;
          companySoraConfigSource = 'parent-propagated';
          console.log(`Using parent SORA config (propagate_sora_config=true, parent_id=${parentId})`);
        } else if (ownConfig) {
          companySoraConfig = ownConfig;
          companySoraConfigSource = 'own';
        } else if (parentConfig) {
          companySoraConfig = parentConfig;
          companySoraConfigSource = 'parent-fallback';
          console.log(`Using parent SORA config as fallback (no own row, parent_id=${parentId})`);
        }

        if (companySoraConfig?.linked_document_ids?.length > 0) {
          const { data: linkedDocs } = await supabase
            .from('documents')
            .select('tittel, beskrivelse, kategori')
            .in('id', companySoraConfig.linked_document_ids);
          linkedDocumentSummary = linkedDocs
            ?.map((d: any) => `- ${d.tittel} (${d.kategori})${d.beskrivelse ? ': ' + d.beskrivelse : ''}`)
            .join('\n') || '';
        }
        if (companySoraConfig) {
          console.log(`Company SORA config loaded (source=${companySoraConfigSource}): maxWind=${companySoraConfig.max_wind_speed_ms}m/s, maxAlt=${companySoraConfig.max_flight_altitude_m}m, allowBvlos=${companySoraConfig.allow_bvlos}, allowNight=${companySoraConfig.allow_night_flight}`);
        }
      } catch (e) {
        console.error('Error fetching company SORA config (using defaults):', e);
      }
    }

    // 9e. Calculate civil twilight if required
    let civilTwilightInfo: { dawn: string; dusk: string } | null = null;
    let civilTwilightViolation = false;
    let civilTwilightMissionTime = '';
    let civilTwilightNoTime = false;
    if (companySoraConfig?.require_civil_twilight && lat && lng) {
      try {
        const missionDate = mission.tidspunkt ? new Date(mission.tidspunkt) : new Date();
        const DEG_TO_RAD = Math.PI / 180;
        const doy = Math.floor((missionDate.getTime() - new Date(missionDate.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
        const gamma = ((2 * Math.PI) / 365) * (doy - 1);
        const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.04089 * Math.sin(2 * gamma));
        const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
        const zenith = 96;
        const latRad = lat * DEG_TO_RAD;
        const cosHA = (Math.cos(zenith * DEG_TO_RAD) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
        if (cosHA >= -1 && cosHA <= 1) {
          const ha = Math.acos(cosHA) * (180 / Math.PI);
          const dawnMin = 720 - 4 * (lng + ha) - eqTime;
          const duskMin = 720 - 4 * (lng - ha) - eqTime;
          const base = new Date(Date.UTC(missionDate.getFullYear(), missionDate.getMonth(), missionDate.getDate()));
          const dawnUTC = new Date(base.getTime() + dawnMin * 60000);
          const duskUTC = new Date(base.getTime() + duskMin * 60000);
          const fmt = (d: Date) => d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
          civilTwilightInfo = { dawn: fmt(dawnUTC), dusk: fmt(duskUTC) };
          console.log(`Civil twilight calculated: dawn=${civilTwilightInfo.dawn}, dusk=${civilTwilightInfo.dusk}`);

          // Deterministic comparison: check if mission time is outside twilight window
          if (mission.tidspunkt) {
            const missionTime = new Date(mission.tidspunkt);
            civilTwilightMissionTime = fmt(missionTime);
            if (missionTime < dawnUTC || missionTime > duskUTC) {
              civilTwilightViolation = true;
              console.log(`Civil twilight VIOLATION: mission at ${civilTwilightMissionTime} is outside ${civilTwilightInfo.dawn}-${civilTwilightInfo.dusk}`);
            } else {
              console.log(`Civil twilight OK: mission at ${civilTwilightMissionTime} is within ${civilTwilightInfo.dawn}-${civilTwilightInfo.dusk}`);
            }
          } else {
            civilTwilightNoTime = true;
            console.log('Civil twilight: no mission time set, will warn');
          }
        } else {
          console.log('Civil twilight: polar conditions, no twilight boundary');
        }
      } catch (e) {
        console.error('Civil twilight calc error:', e);
      }
    }

    const effectiveDroneId = droneId || (assignedDrones[0] as any)?.id;
    const droneData: any = effectiveDroneId 
      ? assignedDrones.find((d: any) => d.id === effectiveDroneId) || assignedDrones[0]
      : null;

    let droneCatalogMatch: any = null;
    let primaryDroneCharacteristicDimensionM: number | null = null;
    let deterministicAlos: ReturnType<typeof calculateAlos> | null = null;
    if (droneData?.modell) {
      try {
        const { data: droneModels } = await supabase
          .from('drone_models' as any)
          .select('name, characteristic_dimension_m, max_speed_mps, max_wind_mps, weight_kg, category')
          .or(`name.ilike.%${droneData.modell}%,name.ilike.%${String(droneData.modell).replace(/^DJI\s+/i, '')}%`)
          .limit(20);

        droneCatalogMatch = pickBestDroneModelMatch((droneModels as any[]) || [], droneData.modell);
        primaryDroneCharacteristicDimensionM = droneCatalogMatch?.characteristic_dimension_m ?? null;
        deterministicAlos = calculateAlos(
          primaryDroneCharacteristicDimensionM,
          isFixedWingDrone(droneData.modell, droneCatalogMatch?.category),
        );
        if (primaryDroneCharacteristicDimensionM) {
          console.log(`Drone CD loaded for ALOS: ${droneData.modell} -> ${primaryDroneCharacteristicDimensionM}m (${droneCatalogMatch?.name})`);
        }
      } catch (e) {
        console.error('Drone model catalog fetch error (continuing without deterministic CD):', e);
      }
    }

    // 9b. Beregn ekte aggregert status for droner/utstyr (samme logikk som UI).
    // drones.status / equipment.status oppdateres ikke automatisk når en
    // inspeksjonsdato/intervall passerer, så vi må re-derive her for at AI
    // ikke skal se "Grønn" på en drone som UI viser som "Rød".
    const countUniqueMissionsSinceInspection = async (
      droneId: string,
      sistInspeksjon: string | null | undefined,
    ): Promise<number> => {
      try {
        let q = supabase.from('mission_drones').select('mission_id, missions!inner(start_dato)').eq('drone_id', droneId);
        if (sistInspeksjon) q = q.gte('missions.start_dato', sistInspeksjon);
        const { data } = await q;
        return data ? new Set(data.map((r: any) => r.mission_id)).size : 0;
      } catch (_) { return 0; }
    };

    const computeDroneStatus = async (d: any): Promise<{
      status: MaintStatus;
      ownStatus: MaintStatus;
      reasons: string[];
      ownReasons: string[];
      linkedReasons: string[];
      affectedItems: string[];
    }> => {
      const [accRes, eqRes] = await Promise.all([
        supabase.from('drone_accessories').select('navn, neste_vedlikehold, varsel_dager').eq('drone_id', d.id),
        supabase.from('drone_equipment').select('equipment(navn, neste_vedlikehold, varsel_dager)').eq('drone_id', d.id),
      ]);
      const accessories = (accRes.data as any[]) || [];
      const linkedEquipment = ((eqRes.data as any[]) || []).map(r => r.equipment).filter(Boolean);
      const missionsSinceInspection = d.inspection_interval_missions
        ? await countUniqueMissionsSinceInspection(d.id, d.sist_inspeksjon)
        : 0;
      const result = calculateDroneAggregatedStatus(
        {
          neste_inspeksjon: d.neste_inspeksjon,
          varsel_dager: d.varsel_dager,
          flyvetimer: d.flyvetimer ?? 0,
          hours_at_last_inspection: d.hours_at_last_inspection ?? 0,
          inspection_interval_hours: d.inspection_interval_hours,
          varsel_timer: d.varsel_timer,
          missions_since_inspection: missionsSinceInspection,
          inspection_interval_missions: d.inspection_interval_missions,
          varsel_oppdrag: d.varsel_oppdrag,
        },
        accessories,
        linkedEquipment,
      );
      const dbStatus = (d.status as MaintStatus) || 'Grønn';
      const finalStatus = worstStatus(result.status, dbStatus);
      // ownStatus skal ikke ta hensyn til DB-status fra koblet utstyr; bruk kun beregnet ownStatus.
      const ownStatus = result.ownStatus;
      if (finalStatus !== dbStatus) {
        console.log(`Drone ${d.modell} (${d.id}): rå DB-status='${dbStatus}', beregnet='${result.status}', endelig='${finalStatus}', egen='${ownStatus}'. Årsaker: ${result.reasons.join('; ')}`);
      }
      return {
        status: finalStatus,
        ownStatus,
        reasons: result.reasons,
        ownReasons: result.ownReasons,
        linkedReasons: result.linkedReasons,
        affectedItems: result.affectedItems,
      };
    };

    const computeEquipmentStatus = async (e: any): Promise<MaintStatus> => {
      let missionsSinceMaintenance = 0;
      if (e.inspection_interval_missions) {
        try {
          const { data } = await supabase.from('mission_equipment').select('mission_id').eq('equipment_id', e.id);
          if (data) {
            const total = new Set(data.map((r: any) => r.mission_id)).size;
            missionsSinceMaintenance = Math.max(0, total - (e.missions_at_last_maintenance ?? 0));
          }
        } catch (_) { /* ignore */ }
      }
      const maint = calculateEquipmentMaintenanceStatus({
        neste_vedlikehold: e.neste_vedlikehold,
        varsel_dager: e.varsel_dager,
        flyvetimer: e.flyvetimer ?? 0,
        hours_at_last_maintenance: e.hours_at_last_maintenance ?? 0,
        inspection_interval_hours: e.inspection_interval_hours,
        varsel_timer: e.varsel_timer,
        missions_since_maintenance: missionsSinceMaintenance,
        inspection_interval_missions: e.inspection_interval_missions,
        varsel_oppdrag: e.varsel_oppdrag,
      });
      return worstStatus(maint, (e.status as MaintStatus) || 'Grønn');
    };

    const primaryDroneStatusInfo = droneData ? await computeDroneStatus(droneData) : null;
    const assignedDroneStatuses = new Map<string, { status: MaintStatus; ownStatus: MaintStatus; linkedReasons: string[] }>();
    for (const d of assignedDrones as any[]) {
      const info = await computeDroneStatus(d);
      assignedDroneStatuses.set(d.id, { status: info.status, ownStatus: info.ownStatus, linkedReasons: info.linkedReasons });
    }

    const assignedEquipmentStatuses = new Map<string, MaintStatus>();
    for (const e of assignedEquipment as any[]) {
      assignedEquipmentStatuses.set(e.id, await computeEquipmentStatus(e));
    }



    // 10. Build AI prompt
    const today = new Date();
    const validCompetencies = allCompetencies.filter((c: any) => 
      !c.utloper_dato || new Date(c.utloper_dato) > today
    );
    const expiredCompetencies = allCompetencies.filter((c: any) => 
      c.utloper_dato && new Date(c.utloper_dato) <= today
    );

    // Aggregate flight stats for all assigned pilots
    const aggregatedFlightStats = {
      totalFlights: pilotFlightStats.reduce((sum, s) => sum + s.totalFlights, 0),
      totalMinutes: pilotFlightStats.reduce((sum, s) => sum + s.totalMinutes, 0),
      last30Days: pilotFlightStats.reduce((sum, s) => sum + s.last30Days, 0),
      last90Days: pilotFlightStats.reduce((sum, s) => sum + s.last90Days, 0),
      lastFlightDate: pilotFlightStats.map(s => s.lastFlightDate).filter(Boolean).sort().reverse()[0] || null,
      flightsWithDrone: effectiveDroneId ? allFlightLogs.filter(log => log.drone_id === effectiveDroneId).length : 0,
    };

    const daysSinceLastFlight = aggregatedFlightStats.lastFlightDate 
      ? Math.floor((today.getTime() - new Date(aggregatedFlightStats.lastFlightDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Normalize airspace warnings (server returns either new schema {z_type,z_name,min_distance,route_inside}
    // or older schema {zone_type,zone_name,distance_meters,is_inside}). Compute deterministic summary.
    const airspaceFacts = (() => {
      const asLang = resolveLang(language);
      const asEn = asLang === 'en';
      const flightHeightM = Number(pilotInputs?.flightHeight ?? 0);
      const isAtOrBelow120m = Number.isFinite(flightHeightM) && flightHeightM <= 120;
      const fmtDistance = (meters: number) => meters >= 1000
        ? `${meters} m (${(meters / 1000).toFixed(2)} km)`
        : `${meters} m`;
      const normalizeType = (t: string | null | undefined): string => {
        if (!t) return 'UKJENT';
        const up = String(t).toUpperCase();
        if (up === 'ATZ_5KM') return 'ATZ_5KM';
        if (up.includes('5KM') || up.includes('5 KM') || up === 'RPAS 5KM' || up === 'RPAS 5KM SONE') return '5KM';
        if (up === 'CTR' || up === 'TIZ' || up === 'CTR/TIZ') return up === 'CTR/TIZ' ? 'CTR' : up;
        return up;
      };
      // First pass: classify zones so CTR descriptions can know whether
      // the route is also inside any 5km zone (which is the only thing
      // that legally forces Ninox/tower coordination).
      const rawMapped = (airspaceWarnings || []).map((w: any) => {
        const rawDist = w.min_distance ?? w.distance_meters ?? 0;
        const dist = Math.round(Number(rawDist) || 0);
        const inside = !!(w.route_inside ?? w.is_inside);
        const type = normalizeType(w.z_type ?? w.zone_type);
        const name = w.z_name ?? w.zone_name ?? 'ukjent';
        return { w, type, name, dist, inside };
      });
      const anyInside5km = rawMapped.some(r => r.type === '5KM' && r.inside);

      const mappedWarnings = rawMapped.map(({ w, type, name, dist, inside }) => {
        // CRITICAL: distance is ALWAYS distance to the zone polygon boundary,
        // NOT distance to an airport, aerodrome or NSM facility. For 5KM zones
        // the boundary is a 5 km radius around the airport — 329 m from the
        // boundary means ~5.3 km from the airport itself.
        const distance_kind = 'zone_boundary';
        let distance_label = asEn
          ? `distance to ${type} zone boundary`
          : `avstand til ${type}-sonens yttergrense`;
        let description = '';
        if (type === '5KM') {
          distance_label = asEn
            ? 'distance to the 5 km zone boundary (NOT distance to the airport itself)'
            : 'avstand til 5 km-sonens yttergrense (IKKE avstand til selve flyplassen)';
          if (inside) {
            description = asEn
              ? `Mission is INSIDE the 5 km zone around "${name}". Requires Ninox approval. Max 120 m AGL.`
              : `Oppdraget er INNENFOR 5 km-sonen rundt «${name}». Krever Ninox-godkjenning. Maks 120 m AGL.`;
          } else {
            description = asEn
              ? `Mission is OUTSIDE the 5 km zone around "${name}" — ${fmtDistance(dist)} outside the 5 km zone boundary (≈ ${(5 + dist/1000).toFixed(2)} km from the airport itself). This is NOT "${dist} m from the airport" and NOT "inside the 5 km buffer". No Ninox approval required for this zone${isAtOrBelow120m ? ' as long as the flight stays at max 120 m AGL' : ''}.`
              : `Oppdraget er UTENFOR 5 km-sonen rundt «${name}» — ${fmtDistance(dist)} utenfor 5 km-sonens yttergrense (≈ ${(5 + dist/1000).toFixed(2)} km fra selve flyplassen). Dette er IKKE «${dist} m fra flyplassen» og IKKE «innenfor 5 km-buffer». Ingen Ninox-godkjenning kreves for denne sonen${isAtOrBelow120m ? ' når flygingen holdes på maks 120 m AGL' : ''}.`;
          }
        } else if (type === 'CTR' || type === 'TIZ') {
          if (inside) {
            if (!anyInside5km && isAtOrBelow120m) {
              description = asEn
                ? `Route overlaps the ${type} layer "${name}", but lies OUTSIDE the 5 km zone around the associated airport. At max 120 m AGL this is 100% legal to fly — no Ninox approval, no ATC clearance and no tower contact required. Treat only as a general awareness warning: watch out for manned traffic in the area.`
                : `Ruten overlapper ${type}-laget «${name}», men ligger UTENFOR 5 km-sonen rundt tilhørende flyplass. Ved maks 120 m AGL er dette 100 % lovlig å fly — ingen Ninox-godkjenning, ingen ATC-klarering og ingen kontakt med tårnet kreves. Behandles kun som en generell aktsomhets­advarsel: vær oppmerksom på bemannet trafikk i området.`;
            } else if (anyInside5km && isAtOrBelow120m) {
              description = asEn
                ? `Route overlaps the ${type} layer "${name}" and lies inside the 5 km zone of the associated airport. Requires Ninox approval. Stay at max 120 m AGL.`
                : `Ruten overlapper ${type}-laget «${name}» og ligger innenfor 5 km-sonen til tilhørende flyplass. Krever Ninox-godkjenning. Hold maks 120 m AGL.`;
            } else {
              description = asEn
                ? `Route overlaps the ${type} layer "${name}" and planned altitude exceeds 120 m AGL. Clarify clearance/permission requirements before flight.`
                : `Ruten overlapper ${type}-laget «${name}» og planlagt høyde er over 120 m AGL. Avklar krav til klarering/tillatelse før flyging.`;
            }
          } else {
            description = asEn
              ? `Mission is OUTSIDE ${type} "${name}". Nearest distance to the ${type} zone boundary is ${dist} m. No ATC clearance required as long as the route stays outside the zone.`
              : `Oppdraget er UTENFOR ${type} «${name}». Nærmeste avstand til ${type}-sonens yttergrense er ${dist} m. Ingen ATC-klarering kreves så lenge ruten holder seg utenfor sonen.`;
          }
        } else if (type === 'ATZ_5KM') {
          distance_label = asEn
            ? 'distance to the 5 km zone boundary around the small airfield'
            : 'avstand til 5 km-sonens yttergrense rundt småflyplassen';
          if (inside) {
            description = asEn
              ? `Mission is INSIDE the 5 km zone around the small airfield "${name}". Pilot must contact the airfield before flight — check myppr.no for PPR (Prior Permission Required). This is NOT an Avinor aerodrome and does NOT require Ninox.`
              : `Oppdraget er INNENFOR 5 km-sonen rundt småflyplassen «${name}». Pilot må kontakte flyplassen før flyging — sjekk myppr.no for PPR (Prior Permission Required). Dette er IKKE en Avinor-aerodrome og krever IKKE Ninox.`;
          } else {
            description = asEn
              ? `Mission is OUTSIDE the 5 km zone around the small airfield "${name}" — ${fmtDistance(dist)} outside the zone boundary. PPR not required, but stay aware of local traffic.`
              : `Oppdraget er UTENFOR 5 km-sonen rundt småflyplassen «${name}» — ${fmtDistance(dist)} utenfor sonegrensen. PPR kreves ikke, men vær oppmerksom på lokal trafikk.`;
          }
        } else {
          description = inside
            ? (asEn ? `Mission is INSIDE zone ${type} "${name}".` : `Oppdraget er INNENFOR sone ${type} «${name}».`)
            : (asEn ? `Mission is OUTSIDE zone ${type} "${name}". Nearest distance to the zone boundary is ${dist} m.` : `Oppdraget er UTENFOR sone ${type} «${name}». Nærmeste avstand til sonegrensen er ${dist} m.`);
        }
        return { type, name, distance: dist, distance_kind, distance_label, inside, severity: w.severity ?? null, description };
      });
      const inside5km = mappedWarnings.filter(w => w.type === '5KM' && w.inside);
      const insideCtr = mappedWarnings.filter(w => (w.type === 'CTR' || w.type === 'TIZ') && w.inside);
      const requiresNinox = inside5km.length > 0;
      const summaryParts: string[] = [];
      if (requiresNinox) {
        summaryParts.push(asEn
          ? `Mission is inside the 5 km zone around ${inside5km.map(w => `"${w.name}"`).join(', ')} and requires Ninox approval.`
          : `Oppdraget er innenfor 5 km-sonen rundt ${inside5km.map(w => `«${w.name}»`).join(', ')} og krever Ninox-godkjenning.`);
      } else {
        const outside5km = mappedWarnings.filter(w => w.type === '5KM' && !w.inside);
        if (outside5km.length > 0) {
          summaryParts.push(asEn
            ? `Mission is OUTSIDE all 5 km zones (${outside5km.map(w => `${w.distance} m outside the 5 km zone boundary around "${w.name}" ≈ ${(5 + w.distance/1000).toFixed(2)} km from the airport itself`).join('; ')}). No Ninox approval required${isAtOrBelow120m ? ' as long as the flight stays at max 120 m AGL' : ''}.`
            : `Oppdraget er UTENFOR alle 5 km-soner (${outside5km.map(w => `${w.distance} m utenfor 5 km-sonens yttergrense rundt «${w.name}» ≈ ${(5 + w.distance/1000).toFixed(2)} km fra selve flyplassen`).join('; ')}). Ingen Ninox-godkjenning kreves${isAtOrBelow120m ? ' når flygingen holdes på maks 120 m AGL' : ''}.`);
        } else {
          summaryParts.push(asEn
            ? 'No 5 km zones nearby. No Ninox approval required.'
            : 'Ingen 5 km-soner i nærheten. Ingen Ninox-godkjenning kreves.');
        }
      }
      if (insideCtr.length > 0) {
        if (asEn) {
          summaryParts.push(isAtOrBelow120m && !requiresNinox
            ? `Route overlaps controlled airspace (${insideCtr.map(w => `${w.type} "${w.name}"`).join(', ')}), but lies outside the 5 km zone. At max 120 m AGL this is 100% legal — no ATC clearance or tower contact required. Only a general awareness warning.`
            : `Inside controlled airspace: ${insideCtr.map(w => `${w.type} "${w.name}"`).join(', ')}. Clarify clearance/permission requirements before flight.`);
        } else {
          summaryParts.push(isAtOrBelow120m && !requiresNinox
            ? `Ruten overlapper kontrollert luftrom (${insideCtr.map(w => `${w.type} «${w.name}»`).join(', ')}), men ligger utenfor 5 km-sonen. Ved maks 120 m AGL er dette 100 % lovlig — ingen ATC-klarering eller tårnkontakt kreves. Kun en generell aktsomhets­advarsel.`
            : `Innenfor kontrollert luftrom: ${insideCtr.map(w => `${w.type} «${w.name}»`).join(', ')}. Avklar krav til klarering/tillatelse før flyging.`);
        }
      } else {
        const nearCtr = mappedWarnings.filter(w => (w.type === 'CTR' || w.type === 'TIZ') && !w.inside);
        if (nearCtr.length > 0) {
          summaryParts.push(asEn
            ? `Outside controlled airspace (nearest distance to zone boundary: ${nearCtr.map(w => `${w.type} "${w.name}" ${w.distance} m`).join('; ')}). No ATC clearance required.`
            : `Utenfor kontrollert luftrom (nærmeste avstand til sonegrense: ${nearCtr.map(w => `${w.type} «${w.name}» ${w.distance} m`).join('; ')}). Ingen ATC-klarering kreves.`);
        }
      }
      const insideAtz5km = mappedWarnings.filter(w => w.type === 'ATZ_5KM' && w.inside);
      if (insideAtz5km.length > 0) {
        summaryParts.push(asEn
          ? `Inside the 5 km zone around small airfield(s): ${insideAtz5km.map(w => `"${w.name}"`).join(', ')}. Pilot must contact the airfield before flight — check myppr.no for PPR. Does NOT require Ninox.`
          : `Innenfor 5 km-sonen rundt småflyplass(er): ${insideAtz5km.map(w => `«${w.name}»`).join(', ')}. Pilot må kontakte flyplassen før flyging — sjekk myppr.no for PPR. Krever IKKE Ninox.`);
      }

      // Ninox er norsk-spesifikk (Luftfartstilsynets system). Ved unified/europeisk
      // gren erstattes Ninox-terminologi med generisk "local coordination"-tekst
      // slik at AI ikke feiler-refererer norsk regelverk for DK/SE/DE/FI.
      const finalText = unifiedAirspaceActive
        ? summaryParts.join(' ')
            .replace(/krever Ninox-godkjenning/gi, 'krever lokal koordinering (verifiser per land)')
            .replace(/requires Ninox approval/gi, 'requires local coordination (verify per country)')
            .replace(/Ingen Ninox-godkjenning kreves/gi, 'Ingen lokal koordinering påkrevd fra denne kilden (verifiser per land)')
            .replace(/No Ninox approval required/gi, 'No local coordination required from this source (verify per country)')
            .replace(/sjekk myppr\.no for PPR/gi, 'verifiser PPR-krav med lokal luftfartsmyndighet')
            .replace(/check myppr\.no for PPR/gi, 'verify PPR requirements with local aviation authority')
            .replace(/Krever IKKE Ninox\.?/gi, '')
            .replace(/Does NOT require Ninox\.?/gi, '')
        : summaryParts.join(' ');

      return {
        warnings: mappedWarnings,
        summary: {
          requires_ninox_approval: unifiedAirspaceActive ? null : requiresNinox,
          requires_local_coordination: unifiedAirspaceActive ? (inside5km.length > 0) : null,
          coverage_region: unifiedAirspaceActive ? 'europe_unified_dk_se_de_fi' : 'norway',
          inside_controlled_airspace: insideCtr.length > 0,
          inside_5km_zone: inside5km.length > 0,
          inside_small_airfield_5km_zone: insideAtz5km.length > 0,
          distance_semantics: 'Alle avstander (warnings[].distance og tall i summary.text) er avstand til SONEGRENSEN (polygonens yttergrense), IKKE til flyplass/aerodrome/NSM-anlegg. For 5KM-soner: avstand til selve flyplassen ≈ 5000 m + distance. For ATZ_5KM (småflyplass): avstand til 5 km-sirkelens grense.',
          controlled_airspace_policy: isAtOrBelow120m && requiresNinox === false ? 'CTR/TIZ-overlapp ved maks 120 m AGL og utenfor 5 km-sonen er operativt varsel/aktsomhet, ikke automatisk no-go/hard-stop.' : 'Avklar lokale luftromskrav basert på høyde og soneoverlapp.',
          small_airfield_policy: unifiedAirspaceActive
            ? '5 km-sone rundt småflyplass i DK/SE/DE/FI: verifiser PPR/koordineringskrav med lokal luftfartsmyndighet (ikke Ninox).'
            : 'ATZ_5KM = 5 km rundt en småflyplass. Krever PPR (Prior Permission Required) — pilot må kontakte flyplassen / bruke myppr.no. IKKE automatisk no-go/hard-stop, IKKE Ninox.',
          text: finalText,
        },
      };
    })();
    console.log('Airspace facts summary:', JSON.stringify(airspaceFacts.summary));

    const contextData = {
      mission: {
        title: mission.tittel,
        location: mission.lokasjon,
        description: mission.beskrivelse,
        scheduledTime: mission.tidspunkt,
        endTime: mission.slutt_tidspunkt,
        riskLevel: mission.risk_nivå,
        route: {
          ...(mission.route as any),
          soraSettings: (mission.route as any)?.soraSettings || null,
        },
        sora: mission.mission_sora?.[0],
        company_requires_sora_on_missions: companyRequireSora,
        customer: mission.customers?.navn,
      },
      weather: skipWeather ? { 
        skipped: true, 
        note: 'Værvurdering hoppet over etter brukerønske' 
      } : (weatherData ? {
        current: weatherData.current,
        warnings: weatherData.warnings,
        recommendation: weatherData.droneFlightRecommendation,
        bestWindow: weatherData.bestFlightWindow,
      } : null),
      airspace: airspaceFacts,
      // GDPR: Anonymize pilot data before sending to AI - use identifiers instead of names
      assignedPilots: assignedPilots.map((p: any, index: number) => {
        const stats = pilotFlightStats.find((s: any) => s.pilotId === p.id);
        const loggedHours = stats ? stats.totalMinutes / 60 : 0;
        // Prefer summed flight_logs (authoritative). Fall back to stored profile value
        // only if the user has no logs at all (e.g. legacy imported totals).
        const totalFlightHours = loggedHours > 0 ? loggedHours : (p.flyvetimer || 0);
        return {
          identifier: `Pilot ${index + 1}`,
          role: p.tittel || 'Pilot',
          totalFlightHours: Math.round(totalFlightHours * 100) / 100,
        };
      }),
      pilotStats: {
        totalAssignedPilots: assignedPilots.length,
        totalFlights: aggregatedFlightStats.totalFlights,
        flightsLast30Days: aggregatedFlightStats.last30Days,
        flightsLast90Days: aggregatedFlightStats.last90Days,
        daysSinceLastFlight,
        flightsWithThisDrone: aggregatedFlightStats.flightsWithDrone,
        validCompetencies: validCompetencies.map((c: any) => ({ name: c.navn, type: c.type, expires: c.utloper_dato })),
        expiredCompetencies: expiredCompetencies.map((c: any) => ({ name: c.navn, type: c.type, expired: c.utloper_dato })),
      },
      assignedDrones: assignedDrones.map((d: any) => {
        const info = assignedDroneStatuses.get(d.id);
        return {
          model: d.modell,
          serialNumber: d.serienummer,
          // status = dronens EGEN status (eksklusiv tilbehør/koblet utstyr).
          // Hard stop skal kun vurderes ut fra denne + valgt oppdragsutstyr.
          status: info?.ownStatus ?? d.status,
          aggregatedStatus: info?.status ?? d.status,
          rawDbStatus: d.status,
          // Koblet utstyr/tilbehør som IKKE er valgt på oppdraget — kun informativt,
          // skal ALDRI utløse hard stop eller senke utstyrs-score.
          linkedOnlyIssues: (info?.linkedReasons ?? []).map((r: string) =>
            `${r} (knyttet til dronen, men ikke valgt på dette oppdraget — antas ikke brukt)`
          ),
          flightHours: d.flyvetimer,
          lastInspection: d.sist_inspeksjon,
          nextInspection: d.neste_inspeksjon,
          available: d.tilgjengelig,
          class: d.klasse,
        };
      }),
      assignedEquipment: assignedEquipment.map((e: any) => ({
        name: e.navn,
        type: e.type,
        status: assignedEquipmentStatuses.get(e.id) ?? e.status,
        rawDbStatus: e.status,
        serialNumber: e.serienummer,
        lastMaintenance: e.sist_vedlikeholdt,
        nextMaintenance: e.neste_vedlikehold,
        available: e.tilgjengelig,
      })),
      primaryDrone: droneData ? {
        model: droneData.modell,
        // status = dronens EGEN status (uten tilbehør/koblet utstyr).
        status: primaryDroneStatusInfo?.ownStatus ?? droneData.status,
        statusReasons: primaryDroneStatusInfo?.ownReasons ?? [],
        statusAffectedItems: primaryDroneStatusInfo?.affectedItems ?? [],
        aggregatedStatus: primaryDroneStatusInfo?.status ?? droneData.status,
        // Koblet utstyr/tilbehør som IKKE er valgt på oppdraget — kun informativt,
        // skal ALDRI utløse hard stop eller senke utstyrs-score.
        linkedOnlyIssues: (primaryDroneStatusInfo?.linkedReasons ?? []).map((r: string) =>
          `${r} (knyttet til dronen, men ikke valgt på dette oppdraget — antas ikke brukt)`
        ),
        rawDbStatus: droneData.status,
        flightHours: droneData.flyvetimer,
        lastInspection: droneData.sist_inspeksjon,
        nextInspection: droneData.neste_inspeksjon,
        available: droneData.tilgjengelig,
        class: droneData.klasse,
        catalogModel: droneCatalogMatch?.name ?? null,
        category: droneCatalogMatch?.category ?? null,
        characteristicDimensionM: primaryDroneCharacteristicDimensionM,
        maxSpeedMps: droneCatalogMatch?.max_speed_mps ?? null,
        maxWindMps: droneCatalogMatch?.max_wind_mps ?? null,
        weightKg: droneCatalogMatch?.weight_kg ?? droneData.vekt ?? null,
        alos: deterministicAlos,
      } : null,
      pilotInputs: pilotInputs || {},
      landUse: landUseData,
      populationDensity: populationData,
      companyConfig: companySoraConfig ? {
        hardStops: {
          maxWindSpeedMs: companySoraConfig.max_wind_speed_ms,
          maxWindGustMs: companySoraConfig.max_wind_gust_ms,
          maxVisibilityKm: companySoraConfig.max_visibility_km,
          maxFlightAltitudeM: companySoraConfig.max_flight_altitude_m,
          requireBackupBattery: companySoraConfig.require_backup_battery,
          requireObserver: companySoraConfig.require_observer,
          minTempC: companySoraConfig.min_temp_c ?? -10,
          maxTempC: companySoraConfig.max_temp_c ?? 40,
          allowBvlos: companySoraConfig.allow_bvlos ?? false,
          allowNightFlight: companySoraConfig.allow_night_flight ?? false,
          requireCivilTwilight: companySoraConfig.require_civil_twilight ?? false,
          maxPilotInactivityDays: companySoraConfig.max_pilot_inactivity_days ?? null,
          maxPopulationDensityPerKm2: companySoraConfig.max_population_density_per_km2 ?? null,
        },
        operativeRestrictions: companySoraConfig.operative_restrictions || null,
        policyNotes: companySoraConfig.policy_notes || null,
        linkedDocuments: linkedDocumentSummary || null,
        civilTwilight: civilTwilightInfo ? { ...civilTwilightInfo, violation: civilTwilightViolation, missionTime: civilTwilightMissionTime, noTimeSet: civilTwilightNoTime } : null,
      } : null,
      solarActivity,
    };

    // Professional SMS System Prompt — content lives in ./prompts.ts (i18n-ready).
    const systemPrompt = prompts.buildSystemPrompt({
      companySoraConfig,
      civilTwilightInfo,
      civilTwilightViolation,
      civilTwilightMissionTime,
      civilTwilightNoTime,
      linkedDocumentSummary,
      skipWeather,
      solarActivity,
    });

    const userPrompt = prompts.buildUserPrompt(contextData);

    // 9. Call AI (with retry for transient 502/503 errors)
    console.log('Calling AI for risk assessment...');
    const aiRequestBody = JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 16000,
      response_format: { type: 'json_object' },
    });


    let aiResponse: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: aiRequestBody,
      });

      if (aiResponse.ok || (aiResponse.status !== 502 && aiResponse.status !== 503)) {
        break;
      }
      console.warn(`AI gateway returned ${aiResponse.status}, retrying (attempt ${attempt + 1})...`);
      // Consume body before retry
      await aiResponse.text();
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!aiResponse!.ok) {
      const errorText = await aiResponse!.text();
      console.error('AI gateway error:', aiResponse!.status, errorText);
      
      if (aiResponse!.status === 429) {
        return new Response(JSON.stringify({ error: prompts.errors.rateLimited }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse!.status === 402) {
        return new Response(JSON.stringify({ error: prompts.errors.creditsExhausted }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse!.status === 502 || aiResponse!.status === 503) {
        return new Response(JSON.stringify({ error: prompts.errors.aiUnavailable }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse!.status}`);
    }

    const aiData = await aiResponse!.json();
    let aiContent = aiData.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from AI response (remove markdown if present)
    aiContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(aiContent);
    } catch (e) {
      // Fallback: try to extract the largest balanced JSON object
      const start = aiContent.indexOf('{');
      const end = aiContent.lastIndexOf('}');
      if (start !== -1 && end > start) {
        let candidate = aiContent.substring(start, end + 1)
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/[\x00-\x1F\x7F]/g, '');
        try {
          aiAnalysis = JSON.parse(candidate);
        } catch (e2) {
          const finishReason = aiData.choices?.[0]?.finish_reason;
          console.error('Failed to parse AI response (finish_reason=' + finishReason + '):', aiContent);
          throw new Error('Invalid AI response format' + (finishReason === 'length' ? ' (truncated)' : ''));
        }
      } else {
        console.error('Failed to parse AI response:', aiContent);
        throw new Error('Invalid AI response format');
      }
    }


    // Safety net: strip leaked internal field/variable names from any narrative text
    // (the model occasionally quotes camelCase/dot-notation tokens from the prompt).
    const JARGON_REPLACEMENTS: Array<[RegExp, string]> = [
      [/`?'?soraSettings\.enabled'?`?\s*(?:satt til|===|er|=)?\s*'?true'?/gi, 'SORA-buffersoner er aktivert'],
      [/`?'?soraSettings\.enabled'?`?\s*(?:satt til|===|er|=|!==)\s*'?(?:false|null|undefined)'?/gi, 'SORA-buffersoner er ikke aktivert'],
      [/`?'?mission\.route\.soraSettings(?:\.enabled)?'?`?/gi, 'SORA-buffersoner'],
      [/`?'?soraSettings'?`?/g, 'SORA-buffersoner'],
      [/`?'?daysSinceLastFlight'?`?/g, 'antall dager siden siste flyging'],
      [/`?'?maxPilotInactivityDays'?`?/g, 'selskapets grense for pilotinaktivitet'],
      [/`?'?primaryDrone\.characteristicDimensionM'?`?/g, 'dronens karakteristiske dimensjon'],
      [/`?'?primaryDrone\.alos(?:\.[a-zA-Z]+)?'?`?/g, 'dronens ALOS-verdi'],
      [/`?'?primaryDrone(?:\.[a-zA-Z]+)*'?`?/g, 'primærdronen'],
      [/`?'?company_requires_sora_on_missions'?`?/g, 'selskapets SORA-krav'],
      [/`?'?solarActivity\.[a-zA-Z]+'?`?/g, 'geomagnetisk aktivitet'],
      [/`?'?kpIndex'?`?/g, 'Kp-indeks'],
      [/`?'?aggregatedFlightStats(?:\.[a-zA-Z]+)*'?`?/g, 'pilotens flystatistikk'],
      [/`?'?lastFlightDate'?`?/g, 'siste registrerte flyging'],
    ];

    const scrubJargon = (input: unknown): unknown => {
      if (typeof input === 'string') {
        let out = input;
        for (const [pattern, replacement] of JARGON_REPLACEMENTS) {
          out = out.replace(pattern, replacement);
        }
        // Generic fallback: bare quoted camelCase tokens like 'someThing' or `dot.path`
        out = out.replace(/['`]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)['`]/g, (_m, p1) => p1.split('.').pop());
        out = out.replace(/['`]([a-z]+[A-Z][a-zA-Z0-9]*)['`]/g, (_m, p1) => p1);
        return out;
      }
      if (Array.isArray(input)) return input.map(scrubJargon);
      if (input && typeof input === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
          result[k] = scrubJargon(v);
        }
        return result;
      }
      return input;
    };
    aiAnalysis = scrubJargon(aiAnalysis) as typeof aiAnalysis;


    if (aiAnalysis.categories) {
      for (const key of Object.keys(aiAnalysis.categories)) {
        if (aiAnalysis.categories[key]?.score !== undefined && aiAnalysis.categories[key]?.score !== null) {
          aiAnalysis.categories[key].score = normalizeRiskScore(aiAnalysis.categories[key].score) ?? aiAnalysis.categories[key].score;
        }
      }
    }

    // Enforce "weather not assessed" when user opted out — weather must not influence overall_score
    if (skipWeather && aiAnalysis.categories?.weather) {
      aiAnalysis.categories.weather.score = null;
      aiAnalysis.categories.weather.go_decision = 'IKKE VURDERT';
      aiAnalysis.categories.weather.actual_conditions = 'Vær er ikke vurdert av AI etter brukerens valg. Pilot må selv vurdere vær før flyging.';
      aiAnalysis.categories.weather.factors = [];
      aiAnalysis.categories.weather.concerns = [];
    }
    if (skipWeather && aiAnalysis.categories && !aiAnalysis.hard_stop_triggered) {
      const otherScores = ['airspace', 'equipment', 'pilot_experience', 'mission_complexity']
        .map((k) => Number(aiAnalysis.categories?.[k]?.score))
        .filter((n) => Number.isFinite(n));
      if (otherScores.length > 0) {
        const avg = otherScores.reduce((a, b) => a + b, 0) / otherScores.length;
        aiAnalysis.overall_score = Math.round(avg * 10) / 10;
      }
    }

    if (aiAnalysis.overall_score !== undefined) {
      aiAnalysis.overall_score = normalizeRiskScore(aiAnalysis.overall_score) ?? aiAnalysis.overall_score;
    }
    aiAnalysis.recommendation = deriveRiskRecommendation(
      aiAnalysis.overall_score,
      aiAnalysis.hard_stop_triggered === true,
      aiAnalysis.recommendation
    );

    const deterministicCharacteristicDimensionM = primaryDroneCharacteristicDimensionM
      ?? (typeof droneData?.vekt === 'number' && droneData.vekt >= 5 ? 1.2 : typeof droneData?.vekt === 'number' && droneData.vekt >= 1 ? 0.6 : 0.3);
    const deterministicMaxSpeedMps = Number(droneCatalogMatch?.max_speed_mps ?? (droneCatalogMatch?.max_wind_mps ? droneCatalogMatch.max_wind_mps * 2 : null) ?? 25);
    const deterministicWeightKg = Number.isFinite(Number(droneCatalogMatch?.weight_kg ?? droneData?.vekt)) ? Number(droneCatalogMatch?.weight_kg ?? droneData?.vekt) : null;

    if (deterministicAlos) {
      aiAnalysis.ground_risk_analysis = {
        ...(aiAnalysis.ground_risk_analysis || {}),
        characteristic_dimension: `${primaryDroneCharacteristicDimensionM}m`,
        max_speed_category: droneCatalogMatch?.max_speed_mps
          ? `${droneCatalogMatch.max_speed_mps} m/s`
          : aiAnalysis.ground_risk_analysis?.max_speed_category,
        drone_weight_kg: droneCatalogMatch?.weight_kg ?? droneData?.vekt ?? aiAnalysis.ground_risk_analysis?.drone_weight_kg,
      };
      aiAnalysis.operation_classification = {
        ...(aiAnalysis.operation_classification || {}),
        alos_max_m: deterministicAlos.alosMaxM,
        alos_calculation: deterministicAlos.alosCalculation,
      };
    }

    const deterministicPopulationDensityValue = populationData ? Math.round(populationData.maxDensity) : 0;
    const deterministicPopulationDensityAverage = populationData ? Number(populationData.avgDensity.toFixed(1)) : null;
    const grLang = resolveLang(language);
    const grEn = grLang === 'en';
    const deterministicGroundRisk = buildDeterministicGroundRisk({
      characteristicDimensionM: deterministicCharacteristicDimensionM,
      maxSpeedMps: deterministicMaxSpeedMps,
      weightKg: deterministicWeightKg,
      populationDensityValue: deterministicPopulationDensityValue,
      populationDensityAverage: deterministicPopulationDensityAverage,
      populationData,
      assignedEquipment,
      observerCount: Number(pilotInputs?.observerCount ?? 0),
      lang: grLang,
      manualMitigations: manualGroundMitigations ?? null,
    });

    if (populationData) {
      const populationDensityValue = Math.round(populationData.maxDensity);
      const populationDensityAverage = Number(populationData.avgDensity.toFixed(1));
      const driverFallback = grEn ? 'within the operation footprint' : 'innenfor operasjonens fotavtrykk';
      const populationDensityDescription = populationData.cellCount > 0
        ? (grEn
            ? `We use population density data from Statistics Norway (SSB) to determine the population density within the drone operation footprint. The assessment is based on a 250-metre grid. The cell with the highest population density overlapping the footprint is dimensioning: ${populationData.calculation}. Average population density within the footprint is ${formatLocaleNumber(populationDensityAverage, 1, grLang)} people/km² based on ${formatLocaleNumber(populationData.cellCount, 0, grLang)} overlapping cells. The dimensioning cell is located ${populationData.driver ?? driverFallback}.`
            : `Vi bruker befolkningstetthetsdata fra Statistisk sentralbyrå (SSB) for å fastsette befolkningstettheten innenfor droneoperasjonens fotavtrykk. Vurderingen er basert på et 250-meters rutenett. Ruten med høyest befolkningstetthet som overlapper fotavtrykket er dimensjonerende: ${populationData.calculation}. Gjennomsnittlig befolkningstetthet i fotavtrykket er ${formatNbNumber(populationDensityAverage, 1)} personer/km² basert på ${formatNbNumber(populationData.cellCount)} overlappende ruter. Dimensjonerende rute ligger ${populationData.driver ?? driverFallback}.`)
        : populationData.summary;

      aiAnalysis.ground_risk_analysis = {
        ...(aiAnalysis.ground_risk_analysis || {}),
        ...deterministicGroundRisk,
        population_density_value: populationDensityValue,
        population_density_calculation: populationData.calculation ?? populationData.summary,
        population_density_average: populationDensityAverage,
        population_density_driver: populationData.driver ?? null,
        population_density_source: populationData.dataSource ?? (grEn ? 'SSB population on 250 m grid (2025)' : 'SSB befolkning på rutenett 250 m (2025)'),
        population_density_footprint: populationData.footprintDescription ?? (grEn ? 'Planned route with operational volume and ground risk buffer.' : 'Planlagt rute med operasjonsvolum og bakkerisikobuffer.'),
        ssb_grid_population: populationData.maxCellPopulation ?? null,
        ssb_grid_resolution_m: populationData.gridResolutionM ?? 250,
        population_density_description: populationDensityDescription,
      };
    } else {
      aiAnalysis.ground_risk_analysis = {
        ...(aiAnalysis.ground_risk_analysis || {}),
        ...deterministicGroundRisk,
        population_density_description: grEn
          ? 'SSB 250 m population density was not available. The system uses a conservative fallback to avoid AI variation.'
          : 'SSB 250 m-befolkningstetthet var ikke tilgjengelig. Systemet bruker konservativ fallback for å unngå AI-variasjon.',
      };
    }

    console.log(`GRC deterministic: ${deterministicGroundRisk.igrc_table_basis} => iGRC=${deterministicGroundRisk.igrc}, reductions=${deterministicGroundRisk.total_reduction}, fGRC=${deterministicGroundRisk.fgrc}`);


    // ===== DETERMINISTIC AIRSPACE GUARD =====
    // Override anything the AI made up about 5km/CTR/distance-to-airport with server truth.
    try {
      const sum = airspaceFacts.summary;
      const insideAny5km = sum.inside_5km_zone === true;
      const insideAnyCtr = sum.inside_controlled_airspace === true;
      const flightHeightM = Number(pilotInputs?.flightHeight ?? 0);
      const lowAltitudeOutside5km = Number.isFinite(flightHeightM) && flightHeightM <= 120 && !insideAny5km;
      const ctrOverlapIsCautionOnly = insideAnyCtr && lowAltitudeOutside5km;

      // Build the set of 5KM zone names and their boundary distances for
      // text scrubbing: any AI sentence that says "N m fra <airport name>"
      // when the server only knows N m to the 5 km boundary is a hallucination.
      const fiveKmWarnings = airspaceFacts.warnings.filter((w: any) => w.type === '5KM' && !w.inside);

      // Replace any "<dist> m/meter fra <airport-words>" with correct framing.
      const scrubAirportDistanceText = (input: string): string => {
        if (!input) return input;
        let out = input;
        // Generic phrasing about flyplass/lufthavn/aerodrome with a meter value
        // that matches one of the 5KM boundary distances → rewrite.
        for (const w of fiveKmWarnings) {
          const d = w.distance;
          if (!d) continue;
          const airportKm = (5 + d / 1000).toFixed(2);
          // Patterns: "329 m fra Trondheim lufthavn", "329 meter fra flyplassen", "329 m unna lufthavnen"
          const re = new RegExp(
            `(\\b${d}\\s*(?:m|meter)\\s*(?:fra|unna|til)\\s*)([^.,;()]*?(?:lufthavn|flyplass|aerodrom|tårn|airport)[^.,;()]*)`,
            'gi'
          );
          out = out.replace(re, (_m, p1, p2) =>
            `${d} m utenfor 5 km-sonens yttergrense rundt ${p2.trim()} (≈ ${airportKm} km til selve flyplassen)`
          );
        }
        // Catch "innenfor 5 km-sonen" when actually outside
        if (!insideAny5km) {
          out = out.replace(/innenfor\s+5\s*km[- ]?sonen/gi, 'utenfor 5 km-sonen');
        }
        return out;
      };

      const scrubObj = (obj: any) => {
        if (!obj) return;
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === 'string') {
            obj[k] = scrubAirportDistanceText(v);
          } else if (Array.isArray(v)) {
            obj[k] = v.map((it) => (typeof it === 'string' ? scrubAirportDistanceText(it) : it));
          }
        }
      };

      // 1) Rewrite airspace category to authoritative text and scrub concerns/factors
      if (aiAnalysis.categories?.airspace) {
        aiAnalysis.categories.airspace.actual_conditions = sum.text;
        const falseClaim = (s: string): boolean => {
          const t = (s || '').toLowerCase();
          if (!insideAny5km && (t.includes('innenfor 5 km') || t.includes('innenfor 5km') || t.includes('5 km buffer') || t.includes('5km buffer') || t.includes('krever ninox') || t.includes('ninox-godkjenning'))) return true;
          if (!insideAny5km && /nærhet til .*?(lufthavn|flyplass|aerodrom).*?(konflikt med bemannet|tillatelse|koordinering)/i.test(s || '')) return true;
          if (!insideAnyCtr && (t.includes('innenfor kontrollert luftrom') || t.includes('innenfor ctr') || t.includes('innenfor tiz') || t.includes('i kontrollert luftrom (ctr)'))) return true;
          if (ctrOverlapIsCautionOnly && /kontrollert luftrom|ctr|tiz/i.test(s || '') && /hard stop|no-go|ikke tillatt|overtredelse|kritisk brudd|krever spesifikk klarering|klarering.*ikke.*bekreftet|atc.*required|kontakt(?:e)?\s+tårn|snakke\s+med\s+tårn|tårnkontakt|krever (?:aktiv handling|klarering|tillatelse|godkjenning)|avklare og eventuelt få klarering/i.test(s || '')) return true;
          // Drop concerns that wrongly state proximity to airport based on the boundary distance.
          for (const w of fiveKmWarnings) {
            if (w.distance && new RegExp(`\\b${w.distance}\\s*(?:m|meter)\\s*(?:fra|unna|til)\\s*[^.,;()]*(?:lufthavn|flyplass|aerodrom|airport)`, 'i').test(s || '')) {
              return true;
            }
          }
          return false;
        };
        if (Array.isArray(aiAnalysis.categories.airspace.concerns)) {
          aiAnalysis.categories.airspace.concerns = aiAnalysis.categories.airspace.concerns
            .filter((c: string) => !falseClaim(c))
            .map((c: string) => scrubAirportDistanceText(c));
        }
        if (Array.isArray(aiAnalysis.categories.airspace.factors)) {
          aiAnalysis.categories.airspace.factors = aiAnalysis.categories.airspace.factors.map((c: string) => scrubAirportDistanceText(c));
        }
        if (!insideAny5km && fiveKmWarnings.length > 0) {
          const guardEn = resolveLang(language) === 'en';
          const outsideTexts = fiveKmWarnings.map((w: any) => guardEn
            ? `${w.distance} m outside the 5 km zone boundary around "${w.name}" (≈ ${(5 + w.distance / 1000).toFixed(2)} km from the airport itself)`
            : `${w.distance} m utenfor 5 km-sonens yttergrense rundt «${w.name}» (≈ ${(5 + w.distance / 1000).toFixed(2)} km fra selve flyplassen)`);
          aiAnalysis.categories.airspace.factors = [
            ...(Array.isArray(aiAnalysis.categories.airspace.factors) ? aiAnalysis.categories.airspace.factors : []),
            guardEn
              ? `Mission is outside the 5 km zone: ${outsideTexts.join('; ')}. No Ninox approval required${lowAltitudeOutside5km ? ' at max 120 m AGL' : ''}.`
              : `Oppdraget er utenfor 5 km-sonen: ${outsideTexts.join('; ')}. Ingen Ninox-godkjenning kreves${lowAltitudeOutside5km ? ' ved maks 120 m AGL' : ''}.`,
          ];
        }
        if (ctrOverlapIsCautionOnly) {
          const guardEn = resolveLang(language) === 'en';
          aiAnalysis.categories.airspace.factors = [
            ...(Array.isArray(aiAnalysis.categories.airspace.factors) ? aiAnalysis.categories.airspace.factors : []),
            guardEn
              ? `Route overlaps controlled airspace (CTR/TIZ), but lies outside the 5 km zone. At max 120 m AGL this is 100% legal — no ATC clearance or tower contact required. Treated only as an awareness warning: watch out for manned traffic.`
              : `Ruten overlapper kontrollert luftrom (CTR/TIZ), men ligger utenfor 5 km-sonen. Ved maks 120 m AGL er dette 100 % lovlig — ingen ATC-klarering eller tårnkontakt kreves. Behandles kun som aktsomhets­advarsel: vær oppmerksom på bemannet trafikk.`,
          ];
          if (aiAnalysis.categories.airspace.go_decision === 'NO-GO') {
            aiAnalysis.categories.airspace.go_decision = 'BETINGET';
            aiAnalysis.categories.airspace.score = Math.max(Number(aiAnalysis.categories.airspace.score) || 0, 6);
          }
        }

        // ATC/Ninox-koordinering: gi creditt eller trekk basert på pilotInputs.atcRequired
        // når oppdrag faktisk krever Ninox (innenfor 5 km-sonen).
        const requiresNinox = sum.requires_ninox_approval === true;
        const atcConfirmed = pilotInputs?.atcRequired === true;
        if (requiresNinox) {
          const cat = aiAnalysis.categories.airspace;
          if (atcConfirmed) {
            // Positiv mitigering — piloten har bekreftet at Ninox/ATC innhentes.
            const currentScore = Number(cat.score) || 0;
            cat.score = Math.min(9, currentScore + 2);
            cat.factors = [
              ...(Array.isArray(cat.factors) ? cat.factors : []),
              `Ninox-/ATC-koordinering bekreftet av pilot: klarering vil innhentes før flyging. Behandles som planlagt strategisk mitigering for operasjon innenfor 5 km-sonen.`,
            ];
            // Fjern bekymringer som handler om manglende ATC/Ninox-koordinering
            if (Array.isArray(cat.concerns)) {
              cat.concerns = cat.concerns.filter((c: string) => {
                const t = (c || '').toLowerCase();
                return !(/ninox|atc|klarering|tårn/i.test(t) && /mangl|ikke.*(bekreft|innhent|avklart|koordinert)|må\s+(?:innhent|avklar|koordiner)/i.test(t));
              });
            }
            if (cat.go_decision === 'NO-GO') {
              cat.go_decision = 'BETINGET';
            }
          } else {
            // Pilot har ikke bekreftet — sørg for at dette fremgår som reell bekymring.
            cat.concerns = [
              ...(Array.isArray(cat.concerns) ? cat.concerns : []),
              `Oppdraget er innenfor 5 km-sonen og krever Ninox-/ATC-godkjenning, men piloten har ikke bekreftet at koordinering er planlagt. Avklar klarering før flyging.`,
            ];
          }
        }
      }

      // 2) Rewrite air_risk_analysis fields
      if (aiAnalysis.air_risk_analysis) {
        const reasoning = String(aiAnalysis.air_risk_analysis.aec_reasoning || '');
        aiAnalysis.air_risk_analysis.aec_reasoning = !insideAnyCtr && /klasse\s*d|ctr|tiz|kontrollert luftrom/i.test(reasoning)
          ? `Operasjonen er utenfor kontrollert luftrom (CTR/TIZ). ${sum.text} Ukontrollert luftrom (klasse G) antas.`
          : scrubAirportDistanceText(reasoning);
      }


      // 3) Scrub top-level free-text fields that often leak the "X m fra flyplassen" myth
      if (typeof aiAnalysis.summary === 'string') aiAnalysis.summary = scrubAirportDistanceText(aiAnalysis.summary);
      if (typeof aiAnalysis.mission_overview === 'string') aiAnalysis.mission_overview = scrubAirportDistanceText(aiAnalysis.mission_overview);
      if (typeof aiAnalysis.assessment_method === 'string') aiAnalysis.assessment_method = scrubAirportDistanceText(aiAnalysis.assessment_method);
      if (typeof aiAnalysis.hard_stop_reason === 'string') aiAnalysis.hard_stop_reason = scrubAirportDistanceText(aiAnalysis.hard_stop_reason);
      if (Array.isArray(aiAnalysis.recommendations)) {
        aiAnalysis.recommendations = aiAnalysis.recommendations.map((r: any) => {
          if (typeof r === 'string') return scrubAirportDistanceText(r);
          if (r && typeof r === 'object') scrubObj(r);
          return r;
        });
      }

      // 4) Clear airspace-only hard_stop (independent of other NO-GOs).
      //    Other categories' NO-GO state remain authoritative, but a bogus
      //    CTR/5km hardstop reason must never stand.
      if (aiAnalysis.hard_stop_triggered === true && !insideAny5km && (!insideAnyCtr || ctrOverlapIsCautionOnly)) {
        const reason = String(aiAnalysis.hard_stop_reason || '').toLowerCase();
        const summaryLc = String(aiAnalysis.summary || '').toLowerCase();
        const reasonMentionsAirspace = /ctr|tiz|kontrollert luftrom|5\s*km|ninox|flyplass|lufthavn|aerodrom/.test(reason) ||
          /ctr|tiz|kontrollert luftrom|5\s*km|ninox|flyplass|lufthavn|aerodrom/.test(summaryLc);
        const otherHardStop =
          (aiAnalysis.categories?.weather?.go_decision === 'NO-GO') ||
          (aiAnalysis.categories?.equipment?.go_decision === 'NO-GO') ||
          (aiAnalysis.categories?.pilot_experience?.go_decision === 'NO-GO');

        if (reasonMentionsAirspace && !otherHardStop) {
          console.log('Clearing bogus airspace-based HARD STOP (server says outside 5km and CTR/TIZ is not an automatic no-go for this altitude/policy)');
          aiAnalysis.hard_stop_triggered = false;
          aiAnalysis.hard_stop_reason = null;
          if (aiAnalysis.categories?.airspace) {
            aiAnalysis.categories.airspace.go_decision = ctrOverlapIsCautionOnly ? 'BETINGET' : 'GO';
          }
          aiAnalysis.recommendation = deriveRiskRecommendation(
            aiAnalysis.overall_score,
            false,
            'go'
          );
          aiAnalysis.summary = (aiAnalysis.summary ? aiAnalysis.summary + ' ' : '') + `(Korrigert: ${sum.text})`;
        } else if (reasonMentionsAirspace && otherHardStop) {
          // Reassign the hardstop reason to the actual triggering category so the UI doesn't lie.
          const trigger =
            aiAnalysis.categories?.weather?.go_decision === 'NO-GO' ? 'vær' :
            aiAnalysis.categories?.equipment?.go_decision === 'NO-GO' ? 'utstyr' :
            aiAnalysis.categories?.pilot_experience?.go_decision === 'NO-GO' ? 'pilotkompetanse' : null;
          if (trigger) {
            aiAnalysis.hard_stop_reason = `Hard stop pga. ${trigger}. (Luftromsbegrunnelse fjernet — ${sum.text})`;
          }
        }
      }
    } catch (guardErr) {
      console.error('Airspace deterministic guard error (non-blocking):', guardErr);
    }

    // ===== DETERMINISTIC AEC / ARC (SORA Annex C, Table 1 + 2) =====
    // AI models frequently pick the wrong AEC (e.g. AEC 11, which is >FL600).
    // Derive AEC and initial ARC from server-known facts instead.
    try {
      const sum = airspaceFacts?.summary ?? {};
      const arLang = resolveLang(language);
      const arEn = arLang === 'en';
      const flightHeightM = Number(pilotInputs?.flightHeight ?? 0);
      const urban = deterministicPopulationDensityValue >= 500;
      const airportEnvironment = sum.inside_5km_zone === true || sum.inside_small_airfield_5km_zone === true;

      // Atypical/segregated airspace (AEC 12) is NOT something the system can detect —
      // it must be explicitly declared and documented by the operator (Annex G 3.20(d)).
      const declaredAtypical = (manualAirRisk as any)?.arc_a_atypical === true;

      const aecRow = deriveAec({
        flightHeightM,
        insideControlledAirspace: sum.inside_controlled_airspace === true,
        airportEnvironment,
        airportAirspaceClass: sum.inside_controlled_airspace === true ? 'D' : 'G',
        urban,
        atypicalSegregated: declaredAtypical,
      });



      const air = { ...(aiAnalysis.air_risk_analysis || {}) };
      air.aec = `AEC ${aecRow.aec}`;
      air.aec_environment = arEn ? aecRow.environment : aecRow.environmentNo;
      air.aec_density_rating = aecRow.density;
      air.initial_arc = aecRow.arc;
      air.aec_declared_atypical = declaredAtypical;
      air.aec_reasoning = declaredAtypical
        ? (arEn
            ? `AEC 12 (atypical/segregated airspace) is declared by the operator, not derived by the system. Requires that all conditions in Annex G section 3.20(d) are met and documented. Initial ARC ${aecRow.arc}.`
            : `AEC 12 (atypisk/segregert luftrom) er erklært av operatøren, ikke utledet av systemet. Krever at alle vilkår i Annex G seksjon 3.20(d) er oppfylt og dokumentert. Initiell ARC ${aecRow.arc}.`)
        : (arEn
            ? `AEC ${aecRow.aec} per SORA Annex C Table 1: ${aecRow.environment}. Flight height ${Math.round(flightHeightM)} m AGL, ${sum.inside_controlled_airspace === true ? 'inside controlled airspace' : 'uncontrolled airspace'}, ${urban ? 'urban' : 'rural'} area${airportEnvironment ? ', airport/heliport environment' : ''}. Generalised density rating ${aecRow.density} gives initial ARC ${aecRow.arc}.`
            : `AEC ${aecRow.aec} etter SORA Annex C tabell 1: ${aecRow.environmentNo}. Flygehøyde ${Math.round(flightHeightM)} m AGL, ${sum.inside_controlled_airspace === true ? 'innenfor kontrollert luftrom' : 'ukontrollert luftrom'}, ${urban ? 'urbant' : 'landlig'} område${airportEnvironment ? ', flyplass-/heliportmiljø' : ''}. Generalisert tetthetsrating ${aecRow.density} gir initiell ARC ${aecRow.arc}.`);

      // Manual ARC override from the user (Annex C Table 2) wins over AI output.
      const manual = manualAirRisk ?? null;
      if (manual && (manual.arc_manual_override === true || declaredAtypical)) {
        const density = manual.manual_density_rating ?? null;
        const atypical = declaredAtypical || manual.arc_a_atypical === true;
        const reduced = atypical ? 'ARC-a' : residualArcForDensity(aecRow.aec, density);
        air.arc_manual_override = true;
        air.manual_density_rating = atypical ? null : density;
        air.arc_a_atypical = atypical;
        air.arc_reduction_justification = manual.arc_reduction_justification ?? null;
        air.residual_arc = reduced ?? aecRow.arc;
      } else {
        air.arc_manual_override = false;
        air.manual_density_rating = null;
        air.arc_a_atypical = false;
        // Without documented manual reduction the residual ARC equals the initial ARC.
        air.residual_arc = aecRow.arc;
      }

      aiAnalysis.air_risk_analysis = air;
      console.log(`AEC deterministic: AEC ${aecRow.aec} => iARC=${aecRow.arc}, residual=${air.residual_arc}`);
    } catch (aecErr) {
      console.error('AEC deterministic guard error (non-blocking):', aecErr);
    }



    // ===== DETERMINISTIC EQUIPMENT/MAINTENANCE GUARD =====
    // Hvis serverberegnet aggregert dronestatus eller utstyrsstatus er Rød
    // (forfalt inspeksjon, overskredet timeintervall, oppdragsintervall,
    // tilbehør eller koblet utstyr), så MÅ utstyrskategorien settes til
    // NO-GO og en hard stop trigges — uavhengig av hva AI skrev.
    try {
      // Pre-beregn røde forhold på EGEN dronestatus + valgt oppdragsutstyr.
      const preRedDroneOwn = (() => {
        if (primaryDroneStatusInfo?.ownStatus === 'Rød') return true;
        for (const d of assignedDrones as any[]) {
          if (droneData && d.id === droneData.id) continue;
          if (assignedDroneStatuses.get(d.id)?.ownStatus === 'Rød') return true;
        }
        return false;
      })();
      const preRedAssignedEq = (assignedEquipment as any[]).some(
        (e) => assignedEquipmentStatuses.get(e.id) === 'Rød'
      );

      // Clearing-steg: AI kan ha satt hard stop basert på aggregert dronestatus
      // (som inkluderer koblet utstyr ikke valgt på oppdraget). Hvis verken
      // egen dronestatus eller valgt utstyr er Rød — nullstill utstyrs-hard-stop.
      if (aiAnalysis?.hard_stop_triggered === true && !preRedDroneOwn && !preRedAssignedEq) {
        const eqCat = aiAnalysis.categories?.equipment;
        const reasonLc = String(aiAnalysis.hard_stop_reason || '').toLowerCase();
        const equipmentHardStop =
          (eqCat && eqCat.go_decision === 'NO-GO') ||
          /vedlikehold|inspeksjon|utstyr|tilbeh|koblet/.test(reasonLc);
        if (equipmentHardStop) {
          console.log('Clearing AI hard stop: own drone status green and assigned equipment green (linked-only reds present).');
          aiAnalysis.hard_stop_triggered = false;
          aiAnalysis.hard_stop_reason = null;
          if (eqCat) {
            eqCat.go_decision = eqCat.go_decision === 'NO-GO' ? 'BETINGET' : (eqCat.go_decision || 'GO');
            const currentScore = Number(eqCat.score);
            eqCat.score = Number.isFinite(currentScore) ? Math.max(currentScore, 6) : 7;
            eqCat.concerns = [
              ...(Array.isArray(eqCat.concerns) ? eqCat.concerns : []),
              'Info: Tilknyttet utstyr/tilbehør har rød status, men er ikke valgt på oppdraget — antas ikke brukt. Ingen hard stop.',
            ];
            aiAnalysis.categories.equipment = eqCat;
          }
        }
      }

      const redDrones: { label: string; reasons: string[] }[] = [];
      const yellowDrones: { label: string; reasons: string[] }[] = [];
      // Notater om koblet utstyr/tilbehør som er Rødt/Gult men IKKE valgt på oppdraget.
      // Disse trigger ikke hard stop — vises kun informativt i utstyrsseksjonen.
      const linkedOnlyNotes: string[] = [];
      const assignedEqIds = new Set((assignedEquipment as any[]).map(e => e.id));

      const addLinkedNotes = (droneLabel: string, linkedReasons: string[]) => {
        for (const r of linkedReasons || []) {
          linkedOnlyNotes.push(`${droneLabel}: ${r} (knyttet til dronen, men ikke valgt på dette oppdraget — antas ikke brukt).`);
        }
      };

      if (primaryDroneStatusInfo) {
        const label = `${droneData?.modell ?? 'Primærdrone'}${droneData?.serienummer ? ` (SN ${droneData.serienummer})` : ''}`;
        if (primaryDroneStatusInfo.ownStatus === 'Rød') redDrones.push({ label, reasons: primaryDroneStatusInfo.ownReasons });
        else if (primaryDroneStatusInfo.ownStatus === 'Gul') yellowDrones.push({ label, reasons: primaryDroneStatusInfo.ownReasons });
        if (primaryDroneStatusInfo.linkedReasons.length > 0) addLinkedNotes(label, primaryDroneStatusInfo.linkedReasons);
      }
      for (const d of assignedDrones as any[]) {
        if (droneData && d.id === droneData.id) continue;
        const info = assignedDroneStatuses.get(d.id);
        const label = `${d.modell ?? 'Drone'}${d.serienummer ? ` (SN ${d.serienummer})` : ''}`;
        if (info?.ownStatus === 'Rød') redDrones.push({ label, reasons: [`Neste inspeksjon: ${d.neste_inspeksjon ?? 'ukjent'}`] });
        else if (info?.ownStatus === 'Gul') yellowDrones.push({ label, reasons: [`Neste inspeksjon: ${d.neste_inspeksjon ?? 'ukjent'}`] });
        if (info?.linkedReasons?.length) addLinkedNotes(label, info.linkedReasons);
      }
      const redEquipment: string[] = [];
      const yellowEquipment: string[] = [];
      for (const e of assignedEquipment as any[]) {
        const s = assignedEquipmentStatuses.get(e.id);
        const label = `${e.navn ?? 'Utstyr'}${e.neste_vedlikehold ? ` (neste vedlikehold ${String(e.neste_vedlikehold).slice(0, 10)})` : ''}`;
        if (s === 'Rød') redEquipment.push(label);
        else if (s === 'Gul') yellowEquipment.push(label);
      }
      // Sikkerhet: dropp evt. duplikater fra linkedOnlyNotes som faktisk er i assignedEquipment.
      // (linkedEquipment-listen er navnbasert, så vi kan ikke matche eksakt — beholder notene som de er.)
      void assignedEqIds;

      if (redDrones.length > 0 || redEquipment.length > 0) {
        const reasonBits: string[] = [];
        for (const d of redDrones) reasonBits.push(`${d.label}: ${d.reasons.join('; ') || 'forfalt vedlikehold/inspeksjon'}`);
        for (const e of redEquipment) reasonBits.push(`Utstyr ${e}: forfalt vedlikehold`);
        const reasonText = `Forfalt vedlikehold/inspeksjon — ${reasonBits.join(' | ')}`;

        // Kort overskriftstekst til konklusjon/hard stop (uten SN/datoer).
        let shortReason: string;
        if (redDrones.length > 0 && redEquipment.length > 0) {
          shortReason = 'Forfalt vedlikehold/inspeksjon på drone og oppdragsutstyr';
        } else if (redDrones.length === 1) {
          shortReason = 'Forfalt vedlikehold/inspeksjon på dronen';
        } else if (redDrones.length > 1) {
          shortReason = `Forfalt vedlikehold/inspeksjon på ${redDrones.length} droner`;
        } else {
          shortReason = 'Forfalt vedlikehold på oppdragsutstyr';
        }
        console.log('Equipment hard-stop triggered:', reasonText);

        aiAnalysis.categories = aiAnalysis.categories || {};
        aiAnalysis.categories.equipment = {
          ...(aiAnalysis.categories.equipment || {}),
          score: 1,
          go_decision: 'NO-GO',
          actual_conditions: reasonText,
          concerns: [
            ...reasonBits.map(r => `Hard stop: ${r}.`),
            ...linkedOnlyNotes.map(n => `Info: ${n}`),
          ],
          factors: [],
        };
        aiAnalysis.hard_stop_triggered = true;
        aiAnalysis.hard_stop_reason = shortReason;
        aiAnalysis.overall_score = Math.min(Number(aiAnalysis.overall_score) || 1, 2);
        aiAnalysis.recommendation = 'no-go';
        aiAnalysis.summary = `${shortReason}. ${aiAnalysis.summary || ''}`.trim();
      } else if (yellowDrones.length > 0 || yellowEquipment.length > 0) {
        const noteBits: string[] = [];
        for (const d of yellowDrones) noteBits.push(`${d.label}: ${d.reasons.join('; ') || 'vedlikehold nærmer seg'}`);
        for (const e of yellowEquipment) noteBits.push(`Utstyr ${e}: vedlikehold nærmer seg`);
        const noteText = `Vedlikehold/inspeksjon nærmer seg fristen — ${noteBits.join(' | ')}`;
        console.log('Equipment caution applied:', noteText);
        aiAnalysis.categories = aiAnalysis.categories || {};
        const eqCat = aiAnalysis.categories.equipment || {};
        const currentScore = Number(eqCat.score);
        eqCat.score = Math.min(Number.isFinite(currentScore) ? currentScore : 7, 6);
        eqCat.go_decision = eqCat.go_decision === 'NO-GO' ? 'NO-GO' : 'BETINGET';
        eqCat.concerns = [
          ...(Array.isArray(eqCat.concerns) ? eqCat.concerns : []),
          ...noteBits.map(n => `Forsiktighet: ${n}.`),
          ...linkedOnlyNotes.map(n => `Info: ${n}`),
        ];
        aiAnalysis.categories.equipment = eqCat;
      } else if (linkedOnlyNotes.length > 0) {
        // Hverken hard stop eller gul status på selve dronen/oppdragsutstyret,
        // men koblet utstyr har avvik — legg ved som ren informasjon.
        aiAnalysis.categories = aiAnalysis.categories || {};
        const eqCat = aiAnalysis.categories.equipment || {};
        eqCat.concerns = [
          ...(Array.isArray(eqCat.concerns) ? eqCat.concerns : []),
          ...linkedOnlyNotes.map(n => `Info: ${n}`),
        ];
        aiAnalysis.categories.equipment = eqCat;
      }
    } catch (eqGuardErr) {
      console.error('Equipment deterministic guard error (non-blocking):', eqGuardErr);
    }


    // Recompute recommendation after guards
    aiAnalysis.recommendation = deriveRiskRecommendation(
      aiAnalysis.overall_score,
      aiAnalysis.hard_stop_triggered === true,
      aiAnalysis.recommendation
    );

    console.log('AI analysis complete:', aiAnalysis.recommendation, 'HARD STOP:', aiAnalysis.hard_stop_triggered, 'Overall score:', aiAnalysis.overall_score);
    console.log('Air risk analysis present:', !!aiAnalysis.air_risk_analysis, aiAnalysis.air_risk_analysis ? JSON.stringify(aiAnalysis.air_risk_analysis).substring(0, 200) : 'MISSING');


    // 10. Save to database
    const { data: savedAssessment, error: saveError } = await supabase
      .from('mission_risk_assessments')
      .insert({
        mission_id: missionId,
        pilot_id: user.id,
        company_id: companyId,
        weather_score: aiAnalysis.categories?.weather?.score || null,
        airspace_score: aiAnalysis.categories?.airspace?.score || null,
        pilot_experience_score: aiAnalysis.categories?.pilot_experience?.score || null,
        mission_complexity_score: aiAnalysis.categories?.mission_complexity?.score || null,
        equipment_score: aiAnalysis.categories?.equipment?.score || null,
        overall_score: aiAnalysis.overall_score,
        recommendation: aiAnalysis.recommendation,
        ai_analysis: aiAnalysis,
        pilot_inputs: pilotInputs || {},
        pilot_comments: pilotComments || {},
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
      // Still return the analysis even if save fails
    }

    // 11. SORA-based auto-approval
    let autoApproved = false;
    let approvalStatus: 'approved' | 'not_approved' | null = null;
    let approvalReason: string | null = null;
    let approvalThreshold: number | null = null;
    try {
      // Use RPC that respects parent-company propagation (propagate_sora_approval)
      const { data: effective, error: effErr } = await supabase
        .rpc('get_effective_sora_approval_config', { _company_id: companyId });

      if (effErr) {
        console.error('get_effective_sora_approval_config error:', effErr);
      }

      const soraApprovalConfig: any = (effective as any)?.config ?? {};
      const inheritedFrom = (effective as any)?.effective_company_id ?? companyId;
      const inherited = (effective as any)?.inherited === true;
      console.log('SORA auto-approval config resolved:', {
        companyId,
        inherited,
        effectiveCompanyId: inheritedFrom,
        sora_based_approval: soraApprovalConfig?.sora_based_approval,
        threshold: soraApprovalConfig?.sora_approval_threshold,
      });

      if (soraApprovalConfig?.sora_based_approval && missionId) {
        const overallScore = aiAnalysis.overall_score ?? 0;
        const hardStopTriggered = aiAnalysis.hard_stop_triggered === true;
        const threshold = Number(soraApprovalConfig.sora_approval_threshold) || 7.0;
        const hardstopRequiresApproval = soraApprovalConfig.sora_hardstop_requires_approval !== false;
        approvalThreshold = threshold;

        if (hardStopTriggered && hardstopRequiresApproval) {
          await supabase.from('missions').update({ approval_status: 'not_approved' }).eq('id', missionId);
          approvalStatus = 'not_approved';
          approvalReason = `Hardstop utløst — krever manuell godkjenning`;
          console.log('SORA auto-approval: DENIED (hardstop triggered)');
        } else if (overallScore >= threshold && !hardStopTriggered) {
          await supabase.from('missions').update({ approval_status: 'approved' }).eq('id', missionId);
          autoApproved = true;
          approvalStatus = 'approved';
          approvalReason = `AI-score ${overallScore.toFixed(1)} oppfyller terskel ${threshold.toFixed(1)}`;
          console.log('SORA auto-approval: APPROVED (score', overallScore, '>=', threshold, ')');
        } else {
          await supabase.from('missions').update({ approval_status: 'not_approved' }).eq('id', missionId);
          approvalStatus = 'not_approved';
          approvalReason = `AI-score ${overallScore.toFixed(1)} er under terskel ${threshold.toFixed(1)} — krever manuell godkjenning`;
          console.log('SORA auto-approval: DENIED (score', overallScore, '<', threshold, ')');
        }
      }
    } catch (approvalErr) {
      console.error('SORA auto-approval error (non-blocking):', approvalErr);
    }

    await finishJob('done');
    return new Response(JSON.stringify({
      success: true,
      assessment: savedAssessment || {
        ...aiAnalysis,
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      },
      aiAnalysis,
      autoApproved,
      approvalStatus,
      approvalReason,
      approvalThreshold,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Risk assessment error:', error);
    try {
      // Best-effort: mark any in-flight job for this user as failed
      await supabase.from('ai_risk_assessment_jobs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: (error as Error)?.message ?? 'unknown' })
        .eq('user_id', user.id).eq('status', 'running');
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
