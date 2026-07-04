/**
 * Canonical catalog of user-toggleable map layer buttons shown in `MapLayerControl`
 * on `/kart`. Used both by the map component (to build the runtime layer list) and
 * by the "Standard kartlag" company setting UI so the two views cannot drift apart.
 *
 * IDs, display names, groups and icons match `layerConfigs.push({...})` in
 * `src/components/OpenAIPMap.tsx`. Dynamic mode-controlled layers
 * (`missions`, `completed_missions`, `planned_published`) are intentionally
 * excluded — they are governed by the map's `mode`, not by admins.
 */
export interface MapLayerCatalogEntry {
  /** Stable id matching `LayerConfig.id` used by MapLayerControl toggles. */
  id: string;
  /** Human-readable name (same string shown in the /kart layer menu). */
  name: string;
  /** Section header in the layer menu. */
  group: string;
  /** Key from MapLayerControl.iconMap. */
  icon: string;
  /** Fallback default when the company has not overridden this layer. */
  defaultEnabled: boolean;
  /**
   * Optional restriction: only companies whose name (or their parent company's name)
   * contains this substring (case-insensitive) may see/toggle the layer.
   */
  restrictedToCompanyNameContains?: string;
}

export const MAP_LAYER_CATALOG: MapLayerCatalogEntry[] = [
  // Luftrom
  { id: "airspace",             name: "Luftrom",              group: "Luftrom",             icon: "layers",         defaultEnabled: true },
  { id: "rpas",                 name: "RPAS 5 km",            group: "Luftrom",             icon: "radio",          defaultEnabled: true },
  { id: "nsm",                  name: "NSM forbudsområder",   group: "Luftrom",             icon: "ban",            defaultEnabled: true },
  { id: "aip",                  name: "P/R/D-soner",          group: "Luftrom",             icon: "shield",         defaultEnabled: false },
  { id: "rmz_tmz_atz",          name: "RMZ / TMZ / ATZ",      group: "Luftrom",             icon: "radio",          defaultEnabled: true },

  // Restriksjoner
  { id: "restriksjonsomrader",  name: "Restriksjonsområder",  group: "Restriksjoner",       icon: "ban",            defaultEnabled: false },
  { id: "fareomrader",          name: "Fareområder",          group: "Restriksjoner",       icon: "alertTriangle",  defaultEnabled: false },
  { id: "sikringsobjekter",     name: "Sikringsobjekter",     group: "Restriksjoner",       icon: "shield",         defaultEnabled: false },
  { id: "notam",                name: "NOTAM",                group: "Restriksjoner",       icon: "alertTriangle",  defaultEnabled: true },

  // Natur & befolkning
  { id: "verneomrader",         name: "Verneområder",         group: "Natur & befolkning",  icon: "treePine",       defaultEnabled: false },
  { id: "befolkning",           name: "Befolkning",           group: "Natur & befolkning",  icon: "users",          defaultEnabled: false },
  { id: "tettsteder",           name: "Tettsteder",           group: "Natur & befolkning",  icon: "users",          defaultEnabled: false },
  { id: "arealbruk",            name: "Arealbruk",            group: "Natur & befolkning",  icon: "users",          defaultEnabled: false },

  // Infrastruktur
  { id: "luftfartshindre",      name: "Luftfartshindre",      group: "Infrastruktur",       icon: "alertTriangle",  defaultEnabled: false },
  { id: "kraftledninger",       name: "Kraftledninger",       group: "Infrastruktur",       icon: "zap",            defaultEnabled: false },
  { id: "eiendomsgrenser",      name: "Eiendomsgrenser",      group: "Infrastruktur",       icon: "mapPin",         defaultEnabled: false },
  { id: "tensio_luftnett",      name: "Luftnett Tensio",      group: "Infrastruktur",       icon: "zap",            defaultEnabled: true },
  { id: "flyplasser",           name: "Flyplasser",           group: "Infrastruktur",       icon: "planeLanding",   defaultEnabled: true },

  // Live trafikk
  { id: "drones",               name: "Droner",               group: "Live trafikk",        icon: "navigation",     defaultEnabled: true },
  { id: "safesky",              name: "Lufttrafikk",          group: "Live trafikk",        icon: "radar",          defaultEnabled: true },
  { id: "nais",                 name: "Skipstrafikk",         group: "Live trafikk",        icon: "navigation",     defaultEnabled: false },
];

/** Section order used by both MapLayerControl and the company settings UI. */
export const MAP_LAYER_GROUP_ORDER = [
  "Luftrom",
  "Restriksjoner",
  "Natur & befolkning",
  "Infrastruktur",
  "Live trafikk",
  "Oppdrag",
  "Annet",
];

/** Resolve the effective default for a layer id given a company override map. */
export function resolveLayerDefault(
  id: string,
  overrides: Record<string, boolean> | null | undefined,
  hardcodedFallback: boolean,
): boolean {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, id)) {
    return !!overrides[id];
  }
  const entry = MAP_LAYER_CATALOG.find((e) => e.id === id);
  return entry ? entry.defaultEnabled : hardcodedFallback;
}
