## Mål
Publisere pilotens telefonnummer i `remarks`-feltet på SafeSky advisory-payload, med brukerkontroll og fallback for manuell entry.

## Endringer

### 1. `src/components/StartFlightDialog.tsx`
- Hent pilotens `telefon` fra `profiles`-tabellen for innlogget bruker (i eksisterende effekt som henter pilotinfo).
- Når `publishMode === 'advisory'`, vis en checkbox under advisory-info-boksen:
  - Label: "Publiser telefonnummer i remarks (anbefalt)"
  - Default: avkrysset (`true`).
- Hvis profilen ikke har `telefon` satt og checkbox er på:
  - Vis input-felt for manuell entry
  - Hjelpetekst: "Tips: lagre telefonnummeret på profil-siden så slipper du å skrive det inn neste gang."
- Ved publisering (`safesky-advisory` invoke med `publish_advisory`), send med:
  - `includePhoneInRemarks: boolean`
  - `phoneNumber: string | null` (fra profil eller manuell entry)
- Gjelder både første publish-call (linje ~654) og forcePublish-call (linje ~711).

### 2. `supabase/functions/safesky-advisory/index.ts`
- Les `includePhoneInRemarks` og `phoneNumber` fra request body.
- Bygg `remarks`-streng:
  - Hvis `includePhoneInRemarks && phoneNumber` → `"Drone operation - planned route. Pilot: <phone>"`
  - Ellers → uendret default `"Drone operation - planned route"`
- Sett i `payload.features[0].properties.remarks` (linje 504).
- Lett sanitering av telefon (strip kontrolltegn, max 100 tegn for å holde under SafeSky sine grenser).

### 3. i18n (`src/i18n/locales/no.json` + `en.json`)
Nye nøkler:
- `flight.publishPhoneInRemarks` — "Publiser telefonnummer i remarks"
- `flight.publishPhoneInRemarksHint` — "SafeSky og andre operatører kan kontakte deg ved konflikt."
- `flight.phoneManualEntry` — "Telefonnummer"
- `flight.phoneManualEntryHint` — "Tips: lagre telefonnummeret på profil-siden for å slippe å fylle ut hver gang."

## Tekniske detaljer
- `profiles.telefon` finnes allerede (kolonne bekreftet i types.ts).
- Ingen DB-migrasjon nødvendig.
- Edge function deployes automatisk.
- Bakoverkompatibel: hvis frontend ikke sender feltene → samme oppførsel som i dag.