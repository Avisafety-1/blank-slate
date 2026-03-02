

## SafeSky Produksjonsnøkkel for Advisory

### Hva skal gjøres
Legge til en ny secret `SAFESKY_PROD_API_KEY` for produksjonsnøkkelen, og oppdatere **kun advisory-publisering** til å bruke produksjons-URL `https://uav-api.safesky.app/v1/advisory` med den nye nøkkelen. Alt annet (UAV-beacons, cron-refresh beacons-henting) forblir på sandbox.

### Endringer

**1. Ny secret: `SAFESKY_PROD_API_KEY`**
- Be brukeren lime inn produksjonsnøkkelen via secrets-verktøyet

**2. `supabase/functions/safesky-advisory/index.ts`**
- Endre `SAFESKY_ADVISORY_URL` fra `https://sandbox-public-api.safesky.app/v1/advisory` til `https://uav-api.safesky.app/v1/advisory`
- Bruk `SAFESKY_PROD_API_KEY` (faller tilbake til `SAFESKY_API_KEY` hvis ikke satt) kun for advisory-kall (`publish_advisory`, `refresh_advisory`, `publish_point_advisory`, `refresh_point_advisory`)
- UAV-publisering (`publish_live_uav`, `publish_uav`) og beacon-henting forblir på sandbox med `SAFESKY_API_KEY`

**3. `supabase/functions/safesky-cron-refresh/index.ts`**
- Legg til `SAFESKY_PROD_API_KEY` for advisory-refresh-delen (Part 1)
- Oppdater advisory-URL til produksjon
- Behold sandbox-URL og `SAFESKY_API_KEY` for beacon-henting (Part 2 og 3)

### Hva forblir uendret
- `safesky-beacons/index.ts` — bruker sandbox for UAV-henting
- `safesky-beacons-fetch/index.ts` — bruker legacy `SAFESKY_BEACONS_API_KEY`
- HMAC-logikken i `_shared/safesky-hmac.ts` — fungerer med begge nøkler

