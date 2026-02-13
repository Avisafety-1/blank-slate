

# Fiks: Komplett PDF-eksport av risikovurdering

## Problem
PDF-eksporten mangler mye innhold fordi:
1. **Feil datastruktur**: Koden antar at `categories` er en array, men det er et objekt (`{ weather: {...}, airspace: {...}, ... }`)
2. **Feil feltnavn**: Koden bruker `positive_factors` men dataen har `factors`
3. **Manglende felter**: `actual_conditions`, `drone_status`, `experience_summary`, `complexity_factors` vises ikke
4. **Manglende detaljer i anbefalinger**: `reason` og `risk_addressed` fra anbefalingene vises ikke
5. **Kategorinavn**: Vises som "weather" istedenfor "Vaer"

## Losning
Skrive om `riskAssessmentPdfExport.ts` til a handtere den faktiske datastrukturen, slik at PDF-en inneholder alt som vises pa skjermen:

### Endringer i `src/lib/riskAssessmentPdfExport.ts`

1. **Kategorier som objekt**: Iterere over `Object.entries(assessment.categories)` istedenfor array
2. **Norske kategorinavn**: Mappe `weather` -> `Vaer`, `airspace` -> `Luftrom`, osv.
3. **Riktige feltnavn**: Bruke `factors` og `concerns` (ikke `positive_factors`)
4. **Kategori-detaljer**: Inkludere `actual_conditions`, `drone_status`, `experience_summary`, `complexity_factors` under hver kategori
5. **Anbefalingsdetaljer**: Inkludere `reason` og `risk_addressed` for hver anbefaling
6. **GO-beslutning**: Bruke `go_decision`-feltet riktig (strengverdier "GO", "BETINGET", "NO-GO")

### Hva PDF-en vil inneholde (komplett)
- Header med oppdragstittel og tidspunkt
- Oppdragsoversikt
- Vurderingsmetode
- Samlet score og anbefaling (GO/BETINGET GO/NO-GO)
- Hard stop-advarsel (hvis relevant)
- Sammendrag/konklusjon
- Kategoriscorer-tabell med pilotkommentarer
- For hver kategori: detaljbeskrivelse, positive faktorer og bekymringer
- Anbefalte tiltak med begrunnelse, gruppert etter prioritet
- Forutsetninger
- AI-forbehold

### Teknisk detalj

Kategoridata i appen:
```text
{
  weather: { score: 8.5, go_decision: "GO", factors: [...], concerns: [...], actual_conditions: "..." },
  airspace: { score: 7.0, go_decision: "BETINGET", factors: [...], concerns: [...] },
  pilot_experience: { ... },
  mission_complexity: { ... },
  equipment: { ... }
}
```

Kategorinavnmapping:
```text
weather -> Vaer
airspace -> Luftrom
pilot_experience -> Piloterfaring
mission_complexity -> Oppdragskompleksitet
equipment -> Utstyr
```

### Filer som endres
Kun 1 fil: `src/lib/riskAssessmentPdfExport.ts`

