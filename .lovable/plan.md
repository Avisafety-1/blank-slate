

# Gjennomgang: Dato/tid i PDF-eksporter

## Funn

Etter gjennomgang av alle 6 PDF-eksportfunksjoner er disse problemene identifisert:

### Problem 1: Oppdragsrapport mangler eksporttidspunkt helt
**Fil:** `src/pages/Oppdrag.tsx` (linje 662-670)

Oppdragsrapporten skriver kun "Oppdragsrapport" og oppdragstittelen i headeren. Den viser **ingen** dato/tid for nar PDFen ble generert. Alle andre PDF-eksporter viser dette.

**Lossning:** Legg til eksporttidspunkt under tittelen, lik monstered i `addPdfHeader()`: `Eksportert: dd.MM.yyyy kl. HH:mm`

### Problem 2: Flyloggbok (person) mangler klokkeslett i eksportdato
**Fil:** `src/components/FlightLogbookDialog.tsx` (linje 189)

Bruker formatet `'Eksportert:' d. MMMM yyyy` som kun viser dato, ikke klokkeslett. Alle andre eksporter inkluderer klokkeslett.

**Lossning:** Endre format til `"'Eksportert:' d. MMMM yyyy 'kl.' HH:mm"`

### Problem 3: Manglende sanitering i Oppdrag incident-dato
**Fil:** `src/pages/Oppdrag.tsx` (linje 1079)

Bruker `format()` direkte i stedet for `formatDateForPdf()` som inkluderer sanitering. Kan gi problemer med spesialtegn fra `nb`-locale.

**Lossning:** Bytt til `formatDateForPdf(incident.hendelsestidspunkt, "dd.MM.yyyy HH:mm")`

## Filer som endres

| Fil | Endring |
|-----|---------|
| `src/pages/Oppdrag.tsx` | Legg til eksportdato/tid i header (linje ~669). Bytt `format()` til `formatDateForPdf()` for incident-dato (linje 1079) |
| `src/components/FlightLogbookDialog.tsx` | Legg til klokkeslett i eksport-datoen (linje 189) |

## Filer som er OK (ingen endring nodvendig)

- `src/lib/pdfUtils.ts` - `addPdfHeader()` bruker `new Date()` korrekt
- `src/lib/incidentPdfExport.ts` - Bruker `addPdfHeader()`, alle datoer korrekt
- `src/components/resources/DroneLogbookDialog.tsx` - Viser dato og tid korrekt
- `src/components/resources/EquipmentLogbookDialog.tsx` - Viser dato og tid korrekt
- `src/pages/Status.tsx` - Viser dato og tid korrekt

