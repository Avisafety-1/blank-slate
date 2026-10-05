// Containment requirement from the map's adjacent-area documentation, recomputed
// with the ASSESSMENT's SAIL (never the SAIL stored in the map).
import {
  calculateContainmentRequirement,
  type ContainmentRequirement,
  type OutdoorAssembliesCategory,
  type PopulationDensityCategory,
  type SailLevel,
  type UaSizeKey,
} from '../_shared/soraContainment.ts';

type Lang = 'no' | 'en';

export interface ContainmentDecision {
  required: ContainmentRequirement | 'Ikke beregnet';
  source: 'map' | 'missing';
  mapSail: string | null;
  assessmentSail: string | null;
  calculatedAt: string | null;
  adjacentRadiusM: number | null;
  avgDensity: number | null;
  densityCategory: string | null;
  outdoorAssemblies: string | null;
  uaSize: string | null;
  outOfScope: boolean;
  warning: boolean;
  note: string | null;
}

const UA = ['1m', '3mShelterApplicable', '3mShelterNotApplicable', '8m', '20m', '40m'];
const DENS = ['50', '500', '5k', '50k', 'NoLimit'];
const OUT = ['40k', '40kTo400k', '400k'];
const SAILS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export const normalizeSail = (v: unknown): SailLevel | null => {
  const m = String(v ?? '').toUpperCase().match(/\b(VI|IV|V|III|II|I)\b/);
  return m && SAILS.includes(m[1]) ? (m[1] as SailLevel) : null;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const resolveContainment = (
  doc: any,
  assessmentSailRaw: unknown,
  lang: Lang,
  sailMissingReason?: string | null,
): ContainmentDecision => {
  const assessmentSail = normalizeSail(assessmentSailRaw);
  const valid = doc && doc.enabled === true && UA.includes(doc.uaSize) &&
    DENS.includes(doc.populationDensityCategory) && OUT.includes(doc.outdoorAssemblies);
  const base: ContainmentDecision = {
    required: 'Ikke beregnet', source: 'missing', mapSail: null, assessmentSail,
    calculatedAt: null, adjacentRadiusM: null, avgDensity: null, densityCategory: null,
    outdoorAssemblies: null, uaSize: null, outOfScope: false, warning: true, note: null,
  };
  if (!valid) {
    return {
      ...base,
      note: lang === 'en'
        ? 'Calculate the adjacent area in the map (Adjacent) to determine the containment requirement'
        : 'Beregn tilstøtende område i kartet (Tilstøtende) for å fastsette inneslutningskrav',
    };
  }
  const mapSail = normalizeSail(doc.sail);
  const withDoc: ContainmentDecision = {
    ...base,
    source: 'map',
    mapSail,
    calculatedAt: typeof doc.calculatedAt === 'string' ? doc.calculatedAt : null,
    adjacentRadiusM: num(doc.adjacentRadiusM),
    avgDensity: num(doc.avgDensity),
    densityCategory: doc.populationDensityCategory,
    outdoorAssemblies: doc.outdoorAssemblies,
    uaSize: doc.uaSize,
  };
  if (!assessmentSail) {
    const reason = sailMissingReason || (lang === 'en' ? 'no SAIL in the assessment' : 'vurderingen har ingen SAIL');
    return {
      ...withDoc,
      note: lang === 'en'
        ? `Containment not looked up: ${reason}`
        : `Inneslutning ikke slått opp: ${reason}`,
    };
  }
  const required = calculateContainmentRequirement(
    doc.uaSize as UaSizeKey, assessmentSail,
    doc.populationDensityCategory as PopulationDensityCategory,
    doc.outdoorAssemblies as OutdoorAssembliesCategory,
  );
  const notes: string[] = [];
  if (mapSail && mapSail !== assessmentSail) {
    notes.push(lang === 'en'
      ? `Adjacent area calculated in the map with SAIL ${mapSail}; the requirement was recalculated with the assessment's SAIL ${assessmentSail}.`
      : `Tilstøtende område beregnet i kartet med SAIL ${mapSail}; kravet er beregnet på nytt med vurderingens SAIL ${assessmentSail}.`);
  }
  const outOfScope = required === 'Out of scope';
  if (outOfScope) notes.push(lang === 'en' ? 'Outside the specific category' : 'Utenfor specific-kategorien');
  return {
    ...withDoc,
    required,
    outOfScope,
    warning: outOfScope || required === 'Error',
    note: notes.length ? notes.join(' ') : null,
  };
};
