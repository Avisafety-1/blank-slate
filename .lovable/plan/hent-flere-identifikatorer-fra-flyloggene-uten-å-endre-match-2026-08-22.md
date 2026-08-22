# Hent flere identifikatorer fra flyloggene (uten å endre matching)

## Bekreftet nåsituasjon

- DroneLog API leverer bare de 16 første tegnene av dronens serienummer. Hos Elverum vgs gir det kollisjoner: `1581F9DEC2584029` deles av DM5P-01 og DM5P-02, og `1581F9DEC259D029` deles av DM5P-05, -06 og -07.
- `parsed_result` inneholder i dag kun `aircraftSN`, `aircraftName`, `batterySN` og `droneType` som identifiserende felt.
- DroneLog API tilbyr i tillegg `DETAILS.fcSN` (flight controller), `DETAILS.rcSN` (fjernkontroll), `DETAILS.cameraSN` og `DETAILS.gimbalSN`. Ingen av disse ligger i feltlista `process-dronelog` sender i dag.
- `aircraftName` er «DJI Mini 5 Pro» på alle Elverum-loggene — standardnavnet, altså ikke satt per drone ennå.

## Hva som gjøres

Kun datainnsamling og synliggjøring. **Ingen endring i automatch-logikken** — den fortsetter nøyaktig som i dag.

1. **Utvid feltlista mot DroneLog API** med `DETAILS.fcSN`, `DETAILS.rcSN`, `DETAILS.cameraSN` og `DETAILS.gimbalSN`, i tillegg til dagens felter.
2. **Les feltene ut av CSV-responsen** og lagre dem i `parsed_result` som `fcSN`, `rcSN`, `cameraSN`, `gimbalSN`. Ingen nye databasekolonner er nødvendig — `parsed_result` er JSON.
3. **Samme felt fra vår egen Fly.io-parser** (`dji-parse-proxy`), slik at ArduPilot-/fallback-veien gir samme struktur der parseren eksponerer verdiene.
4. **Vis identifikatorene i UI** som en liten «Loggidentifikatorer»-seksjon i opplastingsdialogen (dronenavn fra loggen, drone-SN, fjernkontroll-SN, kamera-SN, gimbal-SN, batteri-SN). Kun informasjon — ingenting er koblet til matching.
5. **Diagnostikklogg** i edge-funksjonen som skriver hvilke identifikatorer som faktisk kom med, slik at vi raskt kan se hvilke DJI-modeller som leverer hva.

Feltene begynner å samles inn fra og med neste innkomne logg. Eldre logger får dem ikke uten reprosessering.

## Om navnendring i DJI-kontrolleren

Å gi hver drone et unikt navn i DJI Fly / Pilot 2 er riktig vei: navnet skrives inn i loggen og hentes allerede ut som `aircraftName`. Etter at Elverum har navngitt dronene (f.eks. «DM5P-01»…«DM5P-08») vil navnet dukke opp i den nye identifikatorseksjonen, og vi har et konkret, unikt felt å bygge matching på når vi tar det steget senere.

Filnavnet på selve loggfilen leses ikke og har ingen effekt.

## Teknisk

- `supabase/functions/process-dronelog/index.ts`
  - Legg `DETAILS.fcSN`, `DETAILS.rcSN`, `DETAILS.cameraSN`, `DETAILS.gimbalSN` til feltlista (linje ~158).
  - Nye `findHeaderIndex`-oppslag ved siden av dagens `detAircraftSNIdx`/`detBatterySNIdx`, med samme rensing (fjern hermetegn, trim).
  - Ta med `fcSN`, `rcSN`, `cameraSN`, `gimbalSN` i returobjektet (rundt linje 782–806).
- `supabase/functions/dji-parse-proxy/index.ts`: map `details.fc_sn`, `details.rc_sn`, `details.camera_sn`, `details.gimbal_sn` til de tilsvarende `DETAILS.*`-kolonnene i `mapFrame`.
- `supabase/functions/dji-process-single` og `dji-auto-sync`: samme feltliste hvis de har egne kopier.
- `src/components/UploadDroneLogDialog.tsx`: read-only visning av identifikatorene fra `parsed_result`, med i18n-nøkler i `no.json` og `en.json`.
- `docs/dronelog-api-fields.md`: oppdater tabellen «Felter brukt i AviSafe-integrasjonen».
- Ingen databasemigrasjon, ingen endring i `src/lib/droneLogMatching.ts`.
