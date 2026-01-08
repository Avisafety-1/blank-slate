// Auto-mapping fra AviSafe alvorlighetsgrad → ECCAIRS Occurrence Class (VL431)
const SEVERITY_TO_OCCURRENCE_CLASS: Record<string, string> = {
  'Kritisk': '100',    // Accident
  'Høy': '200',        // Serious incident
  'Middels': '300',    // Incident
  'Lav': '400',        // Occurrence without safety effect
};

interface Incident {
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  hendelsestidspunkt?: string;
}

export interface SuggestedMapping {
  occurrence_class: string | null;
  aircraft_category: string;
  headline: string | null;
  narrative: string | null;
  location_name: string | null;
  occurrence_date: string | null;
}

export function suggestEccairsMapping(incident: Incident): SuggestedMapping {
  return {
    occurrence_class: SEVERITY_TO_OCCURRENCE_CLASS[incident.alvorlighetsgrad] || '500', // Not determined
    aircraft_category: '104', // UAS / RPAS
    headline: incident.tittel?.slice(0, 500) || null,
    narrative: incident.beskrivelse || null,
    location_name: incident.lokasjon || null,
    occurrence_date: incident.hendelsestidspunkt 
      ? new Date(incident.hendelsestidspunkt).toISOString() 
      : null,
  };
}

// Labels for occurrence class values
export const OCCURRENCE_CLASS_LABELS: Record<string, string> = {
  '100': 'Accident',
  '200': 'Serious incident',
  '300': 'Incident',
  '301': 'Major incident',
  '302': 'Significant incident',
  '400': 'Occurrence without safety effect',
  '500': 'Not determined',
  '501': 'Observation',
  '502': 'Occurrence with No Flight Intended',
};
