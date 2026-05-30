## Mål
I test-modus skal vi **ikke** publisere noen advisory-polygon. Vi publiserer kun en `/v1/uav`-beacon med `status: "GROUNDED"` og `altitude: 0`. Da tester vi om SafeSky faktisk viser grounded tracks på live-kartet.

## Endringer

### `supabase/functions/safesky-advisory/index.ts` (action `publish_advisory` / `refresh_advisory`)
- Behold all eksisterende validering (mission, route, area, terrain, callsign-oppslag, testMode-oppslag).
- Når `testMode === true`:
  - **Hopp over** POST til `/v1/advisory` helt.
  - POST **kun** til `/v1/uav` med:
    - `id`: `advisoryId` (samme `AVS_<missionId>`-format vi bruker i dag, slik at refresh oppdaterer samme beacon)
    - `latitude`/`longitude`: centroid av polygonet
    - `altitude: 0`
    - `status: "GROUNDED"`
    - `ground_speed: 0`, `course: 0`
    - `last_update`: now (sek)
    - `call_sign`: callSign (med samme test-prefiks-håndtering som før)
  - Returner samme suksess-respons-shape som før (`success, action, advisoryId, areaKm2, maxAltitudeAmsl: 0, terrainElevation`), slik at fronten ikke trenger endringer. `message` blir f.eks. `"Test mode: GROUNDED beacon published (advisory skipped)"`.
- Når `testMode === false`: uendret oppførsel (advisory som før, ingen /uav-beacon).

### `supabase/functions/safesky-cron-refresh/index.ts`
- I løkken som refresher polygon-advisories: når `testMode === true` for det aktuelle flight/company:
  - **Skipp** advisory-POST.
  - Send i stedet `/v1/uav` GROUNDED-beacon med samme `advisoryId` (refresh-effekt).
  - Tell det som suksess i `advisoryResults`.
- Når `testMode === false`: uendret.

### Ingen DB-endringer
- Kolonner og trigger er allerede på plass.

### Ingen UI-endringer
- Test-modus-toggelen og response-håndteringen i `ChildCompaniesSection.tsx` / kart-laget forblir uendret.

## Verifikasjon
1. Etter deploy: aktiver test-modus, publiser en mission. Sjekk edge-logs at advisory IKKE postes, kun `/v1/uav` GROUNDED.
2. Sjekk `live.safesky.app` for å se om GROUNDED-tracket vises. Hvis ikke, bekrefter det at SafeSky filtrerer GROUNDED fra public live-kart — da vet vi at "test-modus skjuler track" er en gyldig bivirkning.
3. Verifiser at refresh-cron heller ikke poster advisory mens test-modus er på.

## Risiko / merknader
- Hvis et flight bytter test-modus av/på midt i et oppdrag, vil den gamle advisorien fortsatt ligge ute til den utløper hos SafeSky (vi rydder ikke aktivt). Akseptabelt for test-bruk.
- GROUNDED-beacons har egen lifecycle hos SafeSky; vi refresher hvert minutt via cron, så den holdes i live.
