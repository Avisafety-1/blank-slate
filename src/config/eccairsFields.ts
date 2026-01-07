export type EccairsFormat = 'value_list_int_array' | 'text_content_array' | 'raw_json';

export interface EccairsFieldConfig {
  code: number;
  label: string;
  taxonomyCode: string;
  format: EccairsFormat;
  type: 'select' | 'text' | 'textarea';
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  helpText?: string;
}

export const ECCAIRS_FIELDS: EccairsFieldConfig[] = [
  { 
    code: 431, 
    label: 'Hendelsesklasse', 
    taxonomyCode: '24',
    format: 'value_list_int_array',
    type: 'select',
    required: true,
    helpText: 'Obligatorisk for alle ECCAIRS-rapporter'
  },
  { 
    code: 1072, 
    label: 'Flyets fase', 
    taxonomyCode: '24',
    format: 'value_list_int_array',
    type: 'select',
  },
  { 
    code: 17, 
    label: 'Luftfartøykategori', 
    taxonomyCode: '24',
    format: 'value_list_int_array',
    type: 'select',
    defaultValue: '104', // UAS/RPAS
  },
  { 
    code: 453, 
    label: 'Ansvarlig enhet', 
    taxonomyCode: '24',
    format: 'value_list_int_array',
    type: 'select',
    defaultValue: '133', // Norway
    helpText: 'CAA/stat ansvarlig for rapportering'
  },
  { 
    code: 390, 
    label: 'Overskrift', 
    taxonomyCode: '24',
    format: 'text_content_array',
    type: 'text',
    maxLength: 500,
  },
  { 
    code: 391, 
    label: 'Narrativ', 
    taxonomyCode: '24',
    format: 'text_content_array',
    type: 'textarea',
    helpText: 'Detaljert beskrivelse av hendelsen'
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
