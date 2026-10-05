// Backup-battery rule: count battery equipment selected on the mission OR
// linked to the primary drone. Each equipment id counts once.
// Alias list mirrors src/config/equipmentCategories.ts (BATTERY_ALIASES).

const BATTERY_ALIASES = ['batteri', 'battery', 'batteries', 'batterier'];

export const isBatteryType = (type: unknown): boolean =>
  typeof type === 'string' && BATTERY_ALIASES.includes(type.toLowerCase().trim());

export interface EquipmentLike {
  id?: string | null;
  navn?: string | null;
  type?: string | null;
}

export type BatterySource = 'mission' | 'drone';

export interface CountedBattery {
  id: string;
  name: string;
  sources: BatterySource[];
}

export const countBatteries = (
  missionEquipment: EquipmentLike[] = [],
  droneLinkedEquipment: EquipmentLike[] = [],
): { count: number; batteries: CountedBattery[] } => {
  const byId = new Map<string, CountedBattery>();
  const add = (items: EquipmentLike[], source: BatterySource) => {
    for (const e of items || []) {
      if (!e?.id || !isBatteryType(e.type)) continue;
      const existing = byId.get(e.id);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      } else {
        byId.set(e.id, { id: e.id, name: e.navn || 'Batteri', sources: [source] });
      }
    }
  };
  add(missionEquipment, 'mission');
  add(droneLinkedEquipment, 'drone');
  const batteries = [...byId.values()];
  return { count: batteries.length, batteries };
};

export const describeBatteries = (batteries: CountedBattery[], lang: 'no' | 'en'): string => {
  const en = lang === 'en';
  if (batteries.length === 0) return en ? 'Batteries counted: none' : 'Batterier talt: ingen';
  const label = (s: BatterySource) => s === 'mission'
    ? (en ? 'selected on the mission' : 'valgt på oppdraget')
    : (en ? 'linked to the drone' : 'koblet til dronen');
  const parts = batteries.map((b) => `${b.name} (${b.sources.map(label).join(', ')})`);
  return `${en ? 'Batteries counted' : 'Batterier talt'}: ${parts.join('; ')}`;
};

export const backupBatteryReason = (count: number, lang: 'no' | 'en'): string =>
  lang === 'en'
    ? `The company requires a backup battery, but the mission only has ${count} battery(ies)`
    : `Selskapet krever reservebatteri, men oppdraget har bare ${count} batteri(er)`;
