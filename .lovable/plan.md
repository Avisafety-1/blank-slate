

# Fix: Loggbok-oppsummering viser feil flytid ved match

## Problem

Nar en flylogg matcher en eksisterende logg, viser oppsummeringen "+16 min flytid" for pilot, drone og utstyr -- som om hele varigheten skal legges til. Men ved oppdatering av en eksisterende logg skal bare **differansen** mellom ny og gammel varighet legges til (eller trekkes fra).

I tillegg: drone-triggeren (`trg_update_drone_hours`) kjorer kun pa INSERT, ikke UPDATE. Sa ved oppdatering av eksisterende logg oppdateres ikke drone-flyvetimer automatisk -- men `saveLogbookEntries` legger til full varighet pa pilot og utstyr uansett.

## Losning

### 1. Beregn differanse ved match

I `renderLogbookSection`, beregn differansen mellom ny og gammel varighet:

```typescript
const duration = result.durationMinutes;
const isUpdate = !!matchedLog;
const oldDuration = matchedLog?.flight_duration_minutes ?? 0;
const diffMinutes = isUpdate ? duration - oldDuration : duration;
```

### 2. Oppdater UI-oppsummeringen

I stedet for alltid "+{duration} min flytid", vis:

- **Ny logg**: "+16 min flytid" (som na)
- **Match, med differanse**: "+3 min flytid" eller "-2 min flytid" 
- **Match, ingen differanse**: "Ingen endring i flytid" (ingen +/- vises)

### 3. Oppdater `saveLogbookEntries` for match-scenarioet

Nar `matchedLog` finnes:
- Beregn `diffMinutes = result.durationMinutes - matchedLog.flight_duration_minutes`
- Oppdater pilot flyvetimer med `diffMinutes / 60` i stedet for `durationMinutes / 60`
- For utstyr: sjekk om `flight_log_equipment` entries allerede finnes for denne loggen for a unnga duplikater
- For drone: manuelt oppdater `flyvetimer` med `diffMinutes / 60` (siden triggeren kun kjorer pa INSERT)

### 4. Handter pilot `flight_log_personnel` duplikater

Ved oppdatering: sjekk om `flight_log_personnel` entry allerede finnes for denne flight_log. Hvis ja, ikke sett inn pa nytt -- bare oppdater flyvetimer med differansen.

## Tekniske endringer

**Fil: `src/components/UploadDroneLogDialog.tsx`**

- Linje 716: Legg til `diffMinutes`-beregning basert pa `matchedLog`
- Linje 806, 812, 818: Vis `diffMinutes` i stedet for `duration` nar `matchedLog` finnes; vis "Ingen endring" nar diff er 0
- Linje 540-565 (`saveLogbookEntries`): Bruk `diffMinutes` ved match; sjekk for eksisterende entries; oppdater drone manuelt ved UPDATE
- Linje 630: Send differanse-info til `saveLogbookEntries`

~40 linjer endret/lagt til.

