// System decisions computed BEFORE the AI call. Nothing here depends on the
// AI response; the AI only reproduces these values in prose.
import { deriveHardStops, joinHardStopReasons, type HardStopReason } from './hardStops.ts';
import { lookupSail } from './soraGroundRisk.ts';
import { countBatteries, describeBatteries, type EquipmentLike } from './batteryCount.ts';
import { deriveFogAdvisory, type FogAdvisory } from './fog.ts';
import { classifyOperation, type OperationClassification, type OperationClassificationInput } from './operationCategory.ts';
import { resolveContainment, type ContainmentDecision } from './containment.ts';
import { evaluateSoraProfile, isProfileUsable, type SoraProfileEvaluation, type SoraProfileFacts } from '../_shared/soraProfileEvaluation.ts';
import { sanitizeSoraProfile } from '../_shared/soraProfile.ts';

export interface SoraProfileResult extends Omit<SoraProfileEvaluation, 'profileReductions' | 'fgrc' | 'sail'> {
  profileId: string | null;
  documentId: string | null;
  confirmedAt: string | null;
  used: boolean;
}

/**
 * SORA profile step (after iGRC, before fGRC/SAIL). Only a confirmed, current profile
 * in the document's company has any effect; otherwise only a note is returned.
 * Returns the reductions to pass to applyGroundMitigations (manual > profile > auto-M1C).
 */
export const resolveSoraProfile = (
  row: { id?: string; status?: string | null; source_file_url?: string | null; company_id?: string | null; profile?: unknown; confirmed_at?: string | null } | null,
  doc: { id?: string; fil_url?: string | null; company_id?: string | null } | null,
  facts: SoraProfileFacts,
): { result: SoraProfileResult | null; profileReductions: SoraProfileEvaluation['profileReductions'] } => {
  if (!doc) return { result: null, profileReductions: {} };
  const base = { profileId: row?.id ?? null, documentId: doc.id ?? null, confirmedAt: row?.confirmed_at ?? null };
  if (!isProfileUsable(row, doc)) {
    return {
      result: {
        ...base, used: false, state: 'within_envelope', deviations: [], appliedMitigations: [],
        notes: [facts.lang === 'en'
          ? 'SORA profile not confirmed / outdated – the values are not used'
          : 'SORA-profil ikke bekreftet / utdatert – verdiene er ikke brukt'],
      },
      profileReductions: {},
    };
  }
  const ev = evaluateSoraProfile(sanitizeSoraProfile(row!.profile), facts);
  const { profileReductions, fgrc: _f, sail: _s, ...rest } = ev;
  return { result: { ...base, used: true, ...rest }, profileReductions };
};

type HardStopInput = Parameters<typeof deriveHardStops>[0];

export interface SystemDecisionsInput {
  /** mission.route.adjacentAreaDocumentation from the map. */
  containmentDoc?: unknown;
  operation?: Omit<OperationClassificationInput, 'lang'>;
  hardStopInput: Omit<HardStopInput, 'backupBattery'>;
  requireBackupBattery: boolean;
  missionEquipment: EquipmentLike[];
  primaryDroneLinkedEquipment: EquipmentLike[];
  maxVisibilityKm: number | null;
  groundRisk: {
    igrc: number | null;
    fgrc: number | null;
    controlled_ground_minimum?: number | null;
    total_reduction?: number | null;
    outside_sora?: boolean;
    population_band?: string | null;
    igrc_table_basis?: string | null;
  } | null;
  airRisk: { aec: string | null; initial_arc: string | null; residual_arc: string | null } | null;
  alos: { alosMaxM: number | null } | null;
  equipment: {
    primaryDroneStatus: string | null;
    redItems: string[];
    yellowItems: string[];
    linkedOnlyNotes: string[];
  };
  dataAvailability: { population: boolean; airspace: boolean; weather: boolean };
  airspace: {
    inside5km: boolean;
    insideControlled: boolean;
    requiresNinox: boolean;
    atcConfirmed: boolean;
  };
}

export const parseArcLetter = (value: unknown): string | null => {
  const m = String(value ?? '').match(/arc[\s-]*([a-d])/i) ?? String(value ?? '').match(/^\s*([a-d])\s*$/i);
  return m ? m[1].toLowerCase() : null;
};

export interface SystemDecisions {
  hardStops: HardStopReason[];
  hardStopTriggered: boolean;
  hardStopReason: string | null;
  hardStopCategories: string[];
  groundRisk: SystemDecisionsInput['groundRisk'];
  airRisk: SystemDecisionsInput['airRisk'];
  sail: string | null;
  certifiedCategory: boolean;
  alosMaxM: number | null;
  equipment: SystemDecisionsInput['equipment'] & {
    batteries: { required: boolean; count: number; description: string };
  };
  fog: FogAdvisory | null;
  containment: ContainmentDecision;
  operationCategory: OperationClassification;
  dataAvailability: SystemDecisionsInput['dataAvailability'];
  airspace: SystemDecisionsInput['airspace'];
}

export const buildSystemDecisions = (input: SystemDecisionsInput): SystemDecisions => {
  const lang = input.hardStopInput.lang;
  const battery = countBatteries(input.missionEquipment, input.primaryDroneLinkedEquipment);
  const hardStops = deriveHardStops({
    ...input.hardStopInput,
    backupBattery: { required: input.requireBackupBattery, count: battery.count },
  });
  const arcLetter = parseArcLetter(input.airRisk?.residual_arc) ?? parseArcLetter(input.airRisk?.initial_arc);
  const sail = lookupSail(input.groundRisk?.fgrc ?? null, arcLetter);
  const certifiedCategory = sail.certified || input.groundRisk?.outside_sora === true;
  const sailLabel = sail.sail ? `SAIL ${sail.sail}` : null;
  const operationCategory = classifyOperation({
    isVlos: input.operation?.isVlos ?? input.hardStopInput.isVlos,
    flightHeightM: input.operation?.flightHeightM ?? input.hardStopInput.flightHeightM,
    ...input.operation,
    lang: lang === 'en' ? 'en' : 'no',
  });
  const containmentRaw = resolveContainment(
    input.containmentDoc,
    sailLabel,
    lang === 'en' ? 'en' : 'no',
    certifiedCategory
      ? (lang === 'en' ? 'certified category (outside specific/SORA)' : 'sertifisert kategori (utenfor specific/SORA)')
      : null,
    operationCategory.category,
  );
  const containment = { ...containmentRaw, operationCategory: operationCategory.category, operationReasons: operationCategory.reasons };
  return {
    containment,
    operationCategory,
    hardStops,
    hardStopTriggered: hardStops.length > 0,
    hardStopReason: joinHardStopReasons(hardStops),
    hardStopCategories: [...new Set(hardStops.map((r) => r.category))],
    groundRisk: input.groundRisk,
    airRisk: input.airRisk,
    sail: sailLabel,
    certifiedCategory,
    alosMaxM: input.alos?.alosMaxM ?? null,
    equipment: {
      ...input.equipment,
      batteries: {
        required: input.requireBackupBattery,
        count: battery.count,
        description: describeBatteries(battery.batteries, lang),
      },
    },
    fog: deriveFogAdvisory({
      skipWeather: input.hardStopInput.skipWeather,
      current: input.hardStopInput.weatherCurrent,
      maxVisibilityKm: input.maxVisibilityKm,
      lang,
    }),
    dataAvailability: input.dataAvailability,
    airspace: input.airspace,
  };
};

export const SYSTEM_DECISIONS_INSTRUCTION = {
  no: 'Dette er fastsatt av systemet. Gjengi verdiene, ikke beregn eller endre dem.',
  en: 'These are set by the system. Reproduce the values; do not calculate or change them.',
};
