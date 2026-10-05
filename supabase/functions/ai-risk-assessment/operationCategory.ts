// Open vs specific classification. STS is not used. route.soraSettings.enabled
// deliberately does NOT affect the result (it is only a map buffer tool).
export type OperationCategory = 'open' | 'specific';

export interface OperationClassificationInput {
  isVlos: boolean;
  flightHeightM: number | null;
  droneClass?: string | null;
  weightKg?: number | null;
  companyRequiresSora?: boolean;
  hasSoraDocument?: boolean;
  lang?: 'no' | 'en';
}

export interface OperationClassification {
  category: OperationCategory;
  reasons: string[];
}

const T = {
  no: { bvlos: 'BVLOS', height: 'Flyhøyde over 120 m', cls: (c: string) => `Droneklasse ${c}`, weight: 'Uten klassemerke og over 25 kg', company: 'Selskapet krever SORA', doc: 'SORA-dokument valgt på oppdraget' },
  en: { bvlos: 'BVLOS', height: 'Flight height above 120 m', cls: (c: string) => `Drone class ${c}`, weight: 'No class label and above 25 kg', company: 'The company requires SORA', doc: 'SORA document selected on the mission' },
};

export const normalizeDroneClass = (v: unknown): string | null => {
  const m = String(v ?? '').toUpperCase().match(/\bC\s?([0-6])\b/);
  return m ? `C${m[1]}` : null;
};

export const classifyOperation = (i: OperationClassificationInput): OperationClassification => {
  const t = T[i.lang === 'en' ? 'en' : 'no'];
  const reasons: string[] = [];
  if (i.isVlos === false) reasons.push(t.bvlos);
  if (typeof i.flightHeightM === "number" && i.flightHeightM > 120) reasons.push(t.height);
  const cls = normalizeDroneClass(i.droneClass);
  if (cls === 'C5' || cls === 'C6') reasons.push(t.cls(cls));
  else if (!cls && typeof i.weightKg === 'number' && i.weightKg > 25) reasons.push(t.weight);
  if (i.companyRequiresSora) reasons.push(t.company);
  if (i.hasSoraDocument) reasons.push(t.doc);
  return { category: reasons.length ? 'specific' : 'open', reasons };
};
