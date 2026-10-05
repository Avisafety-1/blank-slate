// Shared parity fixtures: used by maintenanceParity_test.ts (Deno edge copy)
// and tests/maintenanceParity.test.ts (app). Dates are relative to "today".
const day = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

export interface ParityCase {
  name: string;
  drone: Record<string, unknown>;
  accessories: Array<Record<string, unknown>>;
  linkedEquipment: Array<Record<string, unknown>>;
  expected: 'Grønn' | 'Gul' | 'Rød';
}

export const parityCases = (): ParityCase[] => [
  { name: 'dato forfalt', drone: { neste_inspeksjon: iso(-3), flyvetimer: 0, hours_at_last_inspection: 0, missions_since_inspection: 0 }, accessories: [], linkedEquipment: [], expected: 'Rød' },
  { name: 'nær forfall', drone: { neste_inspeksjon: iso(5), varsel_dager: 14, flyvetimer: 0, hours_at_last_inspection: 0, missions_since_inspection: 0 }, accessories: [], linkedEquipment: [], expected: 'Gul' },
  { name: 'timer overskredet', drone: { flyvetimer: 60, hours_at_last_inspection: 0, inspection_interval_hours: 50, missions_since_inspection: 0 }, accessories: [], linkedEquipment: [], expected: 'Rød' },
  { name: 'oppdrag nær grense', drone: { flyvetimer: 0, hours_at_last_inspection: 0, missions_since_inspection: 9, inspection_interval_missions: 10 }, accessories: [], linkedEquipment: [], expected: 'Gul' },
  { name: 'drones.status Rød', drone: { flyvetimer: 0, hours_at_last_inspection: 0, missions_since_inspection: 0, status: 'Rød' }, accessories: [], linkedEquipment: [], expected: 'Rød' },
  { name: 'koblet utstyr Rød', drone: { flyvetimer: 0, hours_at_last_inspection: 0, missions_since_inspection: 0 }, accessories: [], linkedEquipment: [{ navn: 'Batteri 1', status: 'Rød' }], expected: 'Rød' },
  { name: 'alt grønt', drone: { neste_inspeksjon: iso(60), flyvetimer: 1, hours_at_last_inspection: 0, inspection_interval_hours: 50, missions_since_inspection: 0 }, accessories: [], linkedEquipment: [], expected: 'Grønn' },
];
