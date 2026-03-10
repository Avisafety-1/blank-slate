

## Problem: Klokkeslett «01:00» på flylogger

### Årsak
`flight_date` er en **date**-kolonne i databasen (kun dato, ingen tid). Ved lagring strippes klokkeslettet med `.toISOString().split('T')[0]` → `"2026-03-10"`. Men visningen på oppdragskortet bruker `format(new Date(log.flight_date), "dd. MMMM yyyy HH:mm")` — JavaScript tolker en dato uten tid som midnatt UTC, som i norsk tidssone (CET/CEST) blir 01:00 eller 02:00.

### Løsning (to deler)

**1. Lagre starttidspunkt i `flight_date` med klokkeslett**

Kolonnen `flight_date` er definert som `date` i databasen. Vi må endre den til `timestamptz` slik at den kan lagre klokkeslett.

- **Migrering**: `ALTER TABLE flight_logs ALTER COLUMN flight_date TYPE timestamptz USING flight_date::timestamptz;`
- **`src/components/UploadDroneLogDialog.tsx`**: Endre alle forekomster av `effectiveDate.toISOString().split('T')[0]` til `effectiveDate.toISOString()` (linje 1205 og 1265) slik at fullt tidspunkt lagres.

**2. Vis korrekt tid på oppdragskortet**

- **`src/components/oppdrag/MissionCard.tsx`** (linje 667): Formatet er allerede `"dd. MMMM yyyy HH:mm"` — dette vil nå vise riktig tid etter migreringen.

### Endringer
| Fil | Hva |
|---|---|
| SQL-migrering | Endre `flight_date` fra `date` til `timestamptz` |
| `UploadDroneLogDialog.tsx` (2 steder) | Lagre fullt ISO-tidspunkt i stedet for kun dato |

