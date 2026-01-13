export type EccairsFormat = 
  | 'value_list_int_array' 
  | 'content_object_array'
  | 'text_content_array' 
  | 'string_array'
  | 'raw_json' 
  | 'local_date'
  | 'local_time'
  | 'utc_date';

export type EccairsFieldGroup = 
  | 'identification'
  | 'location'
  | 'classification'
  | 'aircraft'
  | 'airspace'
  | 'damage'
  | 'narrative';

export const ECCAIRS_FIELD_GROUP_LABELS: Record<EccairsFieldGroup, string> = {
  identification: 'Grunnleggende identifikasjon',
  location: 'Lokasjon og geografi',
  classification: 'Hendelsesklassifisering',
  aircraft: 'Luftfartøy',
  airspace: 'Luftrom',
  damage: 'Skade og konsekvenser',
  narrative: 'Narrativ',
};

export const ECCAIRS_FIELD_GROUP_ICONS: Record<EccairsFieldGroup, string> = {
  identification: '📋',
  location: '📍',
  classification: '⚠️',
  aircraft: '🚁',
  airspace: '🌐',
  damage: '💥',
  narrative: '📝',
};

export interface EccairsFieldConfig {
  code: number;
  label: string;
  taxonomyCode: string;
  format: EccairsFormat;
  type: 'select' | 'text' | 'textarea' | 'date' | 'time' | 'hidden';
  group: EccairsFieldGroup;
  deriveFrom?: number; // Attribute code to derive value from
  entityPath?: string | null; // null = top-level, "4" = Aircraft entity, etc.
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  helpText?: string;
  autoFromField?: string; // Field from incident to auto-populate
}

// Fields ordered logically by group
export const ECCAIRS_FIELDS: EccairsFieldConfig[] = [
  // ===== IDENTIFICATION GROUP =====
  { 
    code: 438, 
    label: 'Lokalt hendelsesnummer (File Number)', 
    taxonomyCode: '24',
    entityPath: '53',
    format: 'string_array',
    type: 'text',
    group: 'identification',
    maxLength: 50,
    helpText: 'Lokalt referansenummer for hendelsen (autogenerert)',
    autoFromField: 'incident_number'
  },
  { 
    code: 601, 
    label: 'Overskrift (Headline)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'string_array',
    type: 'text',
    group: 'identification',
    required: true,
    maxLength: 500,
    helpText: 'Kort beskrivelse av hendelsen på engelsk (fylles automatisk fra tittel)',
    autoFromField: 'tittel'
  },
  { 
    code: 433, 
    label: 'Lokal dato', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_date',
    type: 'date',
    group: 'identification',
    required: true,
    helpText: 'Lokal dato for hendelsen (YYYY-MM-DD)',
    autoFromField: 'hendelsestidspunkt',
  },
  { 
    code: 477, 
    label: 'UTC dato', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_date',
    type: 'hidden',
    group: 'identification',
    deriveFrom: 433,
    helpText: 'UTC-dato beregnet fra lokal dato',
  },
  { 
    code: 457, 
    label: 'Lokal tid', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_time',
    type: 'time',
    group: 'identification',
    helpText: 'Klokkeslett for hendelsen (HH:MM)',
    autoFromField: 'hendelsestidspunkt',
  },

  // ===== LOCATION GROUP =====
  { 
    code: 440, 
    label: 'Stedsnavn (Location Name)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'string_array',
    type: 'text',
    group: 'location',
    maxLength: 200,
    helpText: 'Navn på stedet hvor hendelsen skjedde',
    autoFromField: 'lokasjon'
  },
  { 
    code: 454, 
    label: 'Stat/område for hendelse', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'content_object_array',
    type: 'select',
    group: 'location',
    helpText: 'Land/region hvor hendelsen skjedde (VL454)'
  },
  { 
    code: 453, 
    label: 'Ansvarlig enhet', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'location',
    defaultValue: '6133',
    helpText: 'Enhet ansvarlig for rapportering (6133 = Aircraft operator)'
  },

  // ===== CLASSIFICATION GROUP =====
  { 
    code: 431, 
    label: 'Hendelsesklasse', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    required: true,
    helpText: 'Obligatorisk for alle ECCAIRS-rapporter'
  },
  { 
    code: 430, 
    label: 'Hendelseskategori (CICTT)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    helpText: 'CICTT-kategori som CFIT, LOC-I, MAC, etc. (VL430)'
  },
  { 
    code: 390, 
    label: 'Hendelsestype', 
    taxonomyCode: '24',
    entityPath: '14',
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    helpText: 'Velg hendelsestype fra ECCAIRS VL390-liste (Events entity)'
  },
  { 
    code: 1072, 
    label: 'Deteksjonsfase', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'content_object_array',
    type: 'select',
    group: 'classification',
    helpText: 'Fase da hendelsen ble oppdaget'
  },

  // ===== AIRCRAFT GROUP =====
  { 
    code: 32,
    label: 'Luftfartøykategori', 
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    defaultValue: '6',
    helpText: 'Kategori luftfartøy (VL32)'
  },
  { 
    code: 244,
    label: 'Serienummer (Aircraft Serial Number)', 
    taxonomyCode: '24',
    entityPath: '4',
    format: 'string_array',
    type: 'text',
    group: 'aircraft',
    maxLength: 100,
    helpText: 'Dronens serienummer (hentes automatisk fra tilknyttet oppdrag)',
    autoFromField: 'drone_serial_number'
  },

  // ===== AIRSPACE GROUP =====
  { 
    code: 13,
    label: 'Luftromsklasse (Airspace Class)', 
    taxonomyCode: '24',
    entityPath: '3',
    format: 'value_list_int_array',
    type: 'select',
    group: 'airspace',
    defaultValue: '7',
    helpText: 'Luftromsklasse - G (ukontrollert) er standard. Bruk C for hendelser innenfor TIZ/CTR.'
  },
  { 
    code: 15,
    label: 'Luftromstype (Airspace Type)', 
    taxonomyCode: '24',
    entityPath: '3',
    format: 'value_list_int_array',
    type: 'select',
    group: 'airspace',
    helpText: 'Type luftrom (TMA, CTA, ATZ, RMZ, TMZ, etc.)'
  },

  // ===== DAMAGE GROUP =====
  { 
    code: 432, 
    label: 'Skade på luftfartøy (Damage to Aircraft)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    defaultValue: '98',
    helpText: 'Skadegrad på luftfartøyet (Destroyed, Substantial, Minor, None, Unknown)'
  },
  { 
    code: 448, 
    label: 'Skade på tredjepart (3rd Party Damage)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    defaultValue: '97',
    helpText: 'Skade på tredjepart (Substantial, Minor, None)'
  },
  { 
    code: 456, 
    label: 'Tredjepart berørt',
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    helpText: 'Om tredjepart ble berørt av hendelsen (VL456)'
  },
  { 
    code: 451, 
    label: 'Skadegrad (Injury Level)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    helpText: 'Alvorlighetsgrad på personskade (VL451)'
  },

  // ===== NARRATIVE GROUP =====
  { 
    code: 424, 
    label: 'Narrativspråk', 
    taxonomyCode: '24',
    entityPath: '22',
    format: 'value_list_int_array',
    type: 'select',
    group: 'narrative',
    defaultValue: '43',
    helpText: 'Språket narrativet er skrevet på (VL424) - Norwegian = 43'
  },
  { 
    code: 425, 
    label: 'Narrativ (beskrivelse)', 
    taxonomyCode: '24',
    entityPath: '22',
    format: 'text_content_array',
    type: 'textarea',
    group: 'narrative',
    helpText: 'Detaljert beskrivelse av hendelsen',
    autoFromField: 'beskrivelse'
  },
];

export function getFieldByCode(code: number): EccairsFieldConfig | undefined {
  return ECCAIRS_FIELDS.find(f => f.code === code);
}

export function getRequiredFields(): EccairsFieldConfig[] {
  return ECCAIRS_FIELDS.filter(f => f.required);
}

export function getAttributeLabel(code: number): string {
  const field = getFieldByCode(code);
  return field?.label || `Attributt ${code}`;
}

export function getFieldsByGroup(group: EccairsFieldGroup): EccairsFieldConfig[] {
  return ECCAIRS_FIELDS.filter(f => f.group === group);
}

export function getOrderedGroups(): EccairsFieldGroup[] {
  // Return groups in the order they should appear
  return ['identification', 'location', 'classification', 'aircraft', 'airspace', 'damage', 'narrative'];
}
