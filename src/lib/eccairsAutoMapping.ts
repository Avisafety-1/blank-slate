// Auto-mapping fra AviSafe alvorlighetsgrad → ECCAIRS Occurrence Class (VL431)
const SEVERITY_TO_OCCURRENCE_CLASS: Record<string, string> = {
  'Kritisk': '100',    // Accident
  'Høy': '200',        // Serious incident
  'Alvorlig': '200',   // Serious incident
  'Middels': '300',    // Incident
  'Moderat': '300',    // Incident
  'Lav': '400',        // Occurrence without safety effect
  'Ubetydelig': '500', // Not determined
};

// Postnummer-til-ECCAIRS fylke mapping (basert på gamle fylkesnavn pre-2020)
// VL454: State/Area of Occurrence
const POSTCODE_TO_COUNTY: Record<string, string> = {
  '0': '1113',   // Oslo
  '1': '1103',   // Akershus (nå Viken)
  '2': '1107',   // Hedmark (nå Innlandet)
  '3': '1105',   // Buskerud (nå Viken)
  '4': '1121',   // Vest-Agder (nå Agder)
  '5': '1108',   // Hordaland (nå Vestland)
  '6': '1109',   // Møre og Romsdal
  '7': '1116',   // Sør-Trøndelag (nå Trøndelag)
  '8': '1110',   // Nordland
  '9': '1119',   // Troms (default for 9xxx)
};

// Ekstraher 4-sifret norsk postnummer fra adresse
function extractPostcode(location: string): string | null {
  const match = location.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

// Finn fylke-ID fra postnummer
function getCountyFromPostcode(postcode: string): string | null {
  if (!postcode || postcode.length !== 4) return null;
  
  // Finnmark: 9500-9999
  const postcodeNum = parseInt(postcode, 10);
  if (postcodeNum >= 9500 && postcodeNum <= 9999) {
    return '1106'; // Finnmark
  }
  
  // Østfold (nå Viken): 1500-1899
  if (postcodeNum >= 1500 && postcodeNum <= 1899) {
    return '1112'; // Østfold
  }
  
  // Oppland (nå Innlandet): 2600-2999
  if (postcodeNum >= 2600 && postcodeNum <= 2999) {
    return '1111'; // Oppland
  }
  
  // Telemark (nå Vestfold og Telemark): 3800-3999
  if (postcodeNum >= 3800 && postcodeNum <= 3999) {
    return '1117'; // Telemark
  }
  
  // Aust-Agder (nå Agder): 4800-4999
  if (postcodeNum >= 4800 && postcodeNum <= 4999) {
    return '1104'; // Aust-Agder
  }
  
  // Sogn og Fjordane (nå Vestland): 5700-6899
  if (postcodeNum >= 5700 && postcodeNum <= 6899) {
    return '1115'; // Sogn og Fjordane
  }
  
  // Nord-Trøndelag (nå Trøndelag): 7700-7999
  if (postcodeNum >= 7700 && postcodeNum <= 7999) {
    return '1111'; // Nord-Trøndelag (bruker 1111 for enkelhets skyld)
  }
  
  // Default: bruk første siffer
  const firstDigit = postcode[0];
  return POSTCODE_TO_COUNTY[firstDigit] || null;
}

interface Incident {
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  hendelsestidspunkt?: string;
}

export interface SuggestedMapping {
  occurrence_class: string | null;
  aircraft_category: string;  // VL32 value (6 = RPAS)
  headline: string | null;
  narrative: string | null;
  location_name: string | null;
  occurrence_date: string | null;
  state_area: string[] | null;  // VL454: [country, county?]
}

export function suggestEccairsMapping(incident: Incident): SuggestedMapping {
  // Beregn state_area basert på lokasjon
  let stateArea: string[] = ['179']; // Default: Norway
  
  if (incident.lokasjon) {
    const postcode = extractPostcode(incident.lokasjon);
    const countyId = postcode ? getCountyFromPostcode(postcode) : null;
    if (countyId) {
      stateArea = ['179', countyId]; // Norway + fylke
    }
  }
  
  return {
    occurrence_class: SEVERITY_TO_OCCURRENCE_CLASS[incident.alvorlighetsgrad] || '500', // Not determined
    aircraft_category: '6', // VL32: RPAS (changed from VL17:104)
    headline: incident.tittel?.slice(0, 500) || null,
    narrative: incident.beskrivelse || null,
    location_name: incident.lokasjon || null,
    occurrence_date: incident.hendelsestidspunkt 
      ? new Date(incident.hendelsestidspunkt).toISOString().slice(0, 10)
      : null,
    state_area: stateArea,
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
