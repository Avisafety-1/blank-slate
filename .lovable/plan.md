

## Plan: Hent `project_uuid` automatisk i proxyen før livestream-kall

### Diagnose
`attempts`-loggen viser tydelig:
- `projectUuidSent: null` på alle 5 forsøk → DJI svarer `200403 Forbidden`.
- `v1.0` og `manage`-pathene gir 404 → **kun `/openapi/v0.1/live-stream/start` er gyldig**.
- `list-devices` returnerer ikke `project_uuid` per enhet, så UI sender `undefined`.

Edge-loggene viser samtidig at proxyen allerede vet hvilket prosjekt som finnes (`tryListProjects` returnerer `4f7d6cc9-730e-4380-b936-0adfd02084de` — «DJI Dock 3 test prosjekt Ogndal»). Vi må bare bruke det.

### Endringer

**1. `supabase/functions/flighthub2-proxy/index.ts` — `start-livestream`**
- Hvis `params.projectUuid` mangler:
  1. Kall eksisterende `tryListProjects` for å hente alle FH2-prosjekter.
  2. For hvert prosjekt, kall `/openapi/v0.1/project/device?project_uuid=…` og se etter `deviceSn` (eller dets `child_device_sn` for dock-droner) i listen.
  3. Bruk det første prosjektet som inneholder enheten som `lsProjectUuid`.
  4. Hvis ingen treff: fall tilbake til første prosjekt i lista (bedre enn null) og logg det.
- Cache resultatet i en Map<sn, project_uuid> i request-scope (samme proxy-instans håndterer ofte flere kall i serie).
- Reduser variant-listen til kun den dokumenterte:
  - `POST /openapi/v0.1/live-stream/start` med `video_quality`
  - `POST /openapi/v0.1/live-stream/start` med `quality_type` (fallback)
  - Fjern `v1.0` og `manage-v1.0` (begge bekreftet 404).
- Returner i `attempts` det auto-løste `projectUuid` slik at vi ser hva som ble brukt.

**2. `src/components/admin/FH2DevicesSection.tsx`**
- Når `list-devices`-svaret kommer, og enheter mangler `project_uuid`, kall proxyens `list-projects`/`project-devices` for å berike `devices`-state med `project_uuid` per SN. Dette gir også UI-en korrekt info i debug-panelet.
- Send fortsatt `liveDevice.project_uuid` til `LiveStreamDialog`; hvis det fortsatt er `undefined` faller proxyen tilbake til auto-resolve i punkt 1.

**3. `src/components/admin/LiveStreamDialog.tsx`**
- Vis tydelig i debug-seksjonen hvilket `projectUuid` proxyen faktisk brukte (les `attempts[0].projectUuidSent` fra svaret), slik at vi kan verifisere at auto-resolve traff riktig prosjekt.
- Ingen logikkendring utover dette.

### Filer som endres
- `supabase/functions/flighthub2-proxy/index.ts`
- `src/components/admin/FH2DevicesSection.tsx`
- `src/components/admin/LiveStreamDialog.tsx`

### Resultat
`X-Project-Uuid` blir alltid satt — enten fra UI eller via automatisk oppslag mot DJI sine prosjekt-API-er — og `200403 Forbidden` forsvinner. Vi treffer kun det dokumenterte `v0.1`-endepunktet og får WHEP-URL tilbake for Dock 3-strømmen.

