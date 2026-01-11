export type EccairsFormat = 
  | 'value_list_int_array' 
  | 'content_object_array'
  | 'text_content_array' 
  | 'string_array'
  | 'raw_json' 
  | 'local_date';

export interface EccairsFieldConfig {
  code: number;
  label: string;
  taxonomyCode: string;
  format: EccairsFormat;
  type: 'select' | 'text' | 'textarea' | 'date';
  entityPath?: string | null; // null = top-level, "4" = Aircraft entity, etc.
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  helpText?: string;
  autoFromField?: string; // Field from incident to auto-populate
}

export const ECCAIRS_FIELDS: EccairsFieldConfig[] = [
  { 
    code: 433, 
    label: 'Lokal dato', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_date',
    type: 'date',
    required: true,
    helpText: 'Lokal dato for hendelsen (YYYY-MM-DD)',
    autoFromField: 'hendelsestidspunkt',
  },
  { 
    code: 601, 
    label: 'Overskrift (Headline)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'string_array',
    type: 'text',
    required: true,
    maxLength: 500,
    helpText: 'Kort beskrivelse av hendelsen på engelsk (fylles automatisk fra tittel)',
    autoFromField: 'tittel'
  },
  { 
    code: 431, 
    label: 'Hendelsesklasse', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    required: true,
    helpText: 'Obligatorisk for alle ECCAIRS-rapporter'
  },
  { 
    code: 1072, 
    label: 'Deteksjonsfase', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'content_object_array',
    type: 'select',
    helpText: 'Fase da hendelsen ble oppdaget'
  },
  { 
    code: 32,
    label: 'Luftfartøykategori', 
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    defaultValue: '6',
    helpText: 'Kategori luftfartøy (VL32)'
  },
  { 
    code: 453, 
    label: 'Ansvarlig enhet', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    defaultValue: '33',
    helpText: 'CAA/stat ansvarlig for rapportering'
  },
  { 
    code: 390, 
    label: 'Hendelsestype', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    helpText: 'Velg hendelsestype fra ECCAIRS VL390-liste'
  },
  { 
    code: 451, 
    label: 'Skadegrad (Injury Level)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    helpText: 'Alvorlighetsgrad på personskade (VL451)'
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
