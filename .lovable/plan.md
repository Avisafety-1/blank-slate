# Historisk værdata på oppdrag opprettet fra flylogg

## Problem
Når et oppdrag opprettes fra en flylogg (DJI/ArduPilot-opplastning eller manuell flytidlogg) settes `missions.weather_data_snapshot` aldri ved insert. Oppdraget får `status: 'Fullført'` med en gang, så statusendringslogikken i `AddMissionDialog` / `MissionStatusDropdown` (som vanligvis lager `{ unavailable: true, reason: 'historical' }` når flyturen er > 24t gammel) trigger heller aldri.

Resultat: `DroneWeatherPanel` får `savedWeatherData={undefined}` og henter **live vær for nåtidspunktet** — som er feil for et historisk oppdrag. Fallback-teksten "Værdata ikke tilgjengelig for historiske oppdrag" finnes allerede i panelet, men nås aldri for disse oppdragene.

## Løsning
Bruk samme regel som finnes i `AddMissionDialog` / `MissionStatusDropdown` / `auto-complete-missions`: ved insert av et oppdrag fra flylogg, beregn alder på flyturen og sett `weather_data_snapshot` deretter.

- Hvis `flightDate` er **> 24 timer** gammel → sett `{ captured_at, unavailable: true, reason: 'historical', source: 'flight_log_import' | 'flight_timer' }` direkte i insert-payloaden.
- Hvis `flightDate` er **≤ 24 timer** gammel og koordinater finnes → hent live vær via `drone-weather` edge function (samme mønster som `AddMissionDialog`) og lagre snapshot. Ved feil/timeout: skriv `unavailable`-stub i stedet.
- Hvis koordinater mangler → skriv `{ unavailable: true, reason: 'no_location' }`.

Dermed vil eksisterende fallback-UI i `DroneWeatherPanel.tsx:244–264` automatisk vise "Værdata ikke tilgjengelig for historiske oppdrag" uten ekstra endringer.

## Endringer

### 1. Ny hjelpefunksjon `src/lib/missionWeatherSnapshot.ts`
Trekk ut den gjentatte logikken fra `AddMissionDialog` og `MissionStatusDropdown` til én funksjon:

```ts
buildMissionWeatherSnapshot({
  flightDate: Date,
  latitude: number | null,
  longitude: number | null,
  source: 'flight_log_import' | 'flight_timer' | 'status_dropdown' | 'add_dialog',
}): Promise<object>
```

Returnerer enten faktisk værsnapshot (via `supabase.functions.invoke('drone-weather', ...)` med 8s timeout) eller en `unavailable`-stub i samme form som `auto-complete-missions` bruker.

### 2. `src/components/UploadDroneLogDialog.tsx` (Path 1 — `handleCreateNew`, linje ~1846)
Før `missions.insert`, kall hjelpefunksjonen med `effectiveDate` + `result.startPosition`. Inkluder resultatet som `weather_data_snapshot` i insert-payloaden. Dekker både DJI- og ArduPilot-opplastninger (begge går gjennom denne pathen).

### 3. `src/components/LogFlightTimeDialog.tsx` (Path 3 — `handleSubmit`, linje ~719)
Samme behandling før `missions.insert`: kall hjelpefunksjonen med `flightDate` + `lat/lng`, legg snapshot på payloaden.

### 4. Refaktorer `AddMissionDialog.tsx:659–724` og `MissionStatusDropdown.tsx:91–117`
Bytt ut den dupliserte inline-logikken med kall til den nye hjelpefunksjonen. Ingen funksjonell endring — bare konsolidering så regelen finnes ett sted.

### 5. UI — ingen endring nødvendig
`DroneWeatherPanel.tsx:244–254` viser allerede "Værdata ikke tilgjengelig for historiske oppdrag" når `savedWeatherData.unavailable === true`. `MissionCard.tsx:597–601` og `MissionDetailDialog.tsx:316–320` videresender allerede `weather_data_snapshot` til panelet.

> Valgfritt tekstjustering: hvis du heller vil ha den nøyaktige formuleringen "Historisk værdata ikke tilgjengelig" (fra brukerforespørselen), oppdaterer jeg strengen i `DroneWeatherPanel.tsx:251`. Si fra om det skal med.

## Tekniske detaljer

JSON-form (matcher eksisterende mønster fra `auto-complete-missions`):
```json
{
  "captured_at": "<ISO>",
  "unavailable": true,
  "reason": "historical",
  "source": "flight_log_import"
}
```

24t-terskel: `Date.now() - flightDate.getTime() > 24 * 60 * 60 * 1000`.

Ingen DB-migrasjon nødvendig — `missions.weather_data_snapshot jsonb` finnes allerede.

## Verifisering
1. Last opp en DJI-logg datert i går → nytt oppdrag har `weather_data_snapshot.unavailable === true, reason === 'historical'`; MissionCard viser "Værdata ikke tilgjengelig...".
2. Last opp en logg fra siste time → oppdrag får faktisk værsnapshot fra `drone-weather`.
3. Manuell flytid registrert med backdated `flightStartTime` > 24t → historisk markør.
4. Eksisterende oppdrag opprettet via "Nytt oppdrag" → uendret oppførsel (samme hjelpefunksjon).
