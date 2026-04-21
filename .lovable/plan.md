

## Plan: Fikse FH2 livestream — bruk `/openapi/v1.0/` (ikke v0.1)

### Diagnose
Du har rett. Dokumentasjonsfanen heter «NEW FlightHub 2 OpenAPI **V1.0**», men endepunktet vises som `/openapi/v0.1/live-stream/start`. Det er fordi DJI nylig har flyttet livestream-modulene til `v1.0`-pathen (mens flere andre endepunkter fortsatt fungerer på `v0.1`). Vår proxy treffer kun `v0.1`, som derfor gir `200500 internal server error` — endepunktet eksisterer på den gamle ruten, men implementasjonen bak er flyttet/avviklet.

Andre tegn som peker mot dette:
- `manage/api/v1.0/live-stream/start` gir 404 (ingen rute der heller).
- Andre FH2-endepunkter vi har testet på `v0.1` (system_status, device, project) svarer fortsatt OK, så token + HMAC-signering er korrekt.

### Endringer

**1. `supabase/functions/flighthub2-proxy/index.ts` — `start-livestream`-action**
- Prøv variantene i denne rekkefølgen og returner første suksess:
  1. `POST {fh2BaseUrl}/openapi/v1.0/live-stream/start`  ← **ny, primær**
  2. `POST {fh2BaseUrl}/openapi/v0.1/live-stream/start`  ← beholdes som fallback
  3. `POST {fh2BaseUrl}/manage/api/v1.0/live-stream/start` ← beholdes for fullstendighet
- Behold dagens payload-fix (string-`quality_type`, `X-Request-Id`, `X-Project-Uuid`).
- Legg alle forsøk i `attempts`-array og returner dem ved feil (samme mønster som `debug-endpoint`) så vi ser hvilken variant som svarte hva.

**2. `debug-endpoint`-action**
- Utvid `variants`-listen til også å inkludere `openapi/v1.0` slik at man fra UI kan teste vilkårlige `v1.0`-endepunkter (f.eks. `live-stream/start`, `live-stream/stop`, `live-stream/status`) uten kodeendring.

**3. Ingen UI-endring nødvendig**
- `LiveStreamDialog` sender allerede `quality_type` som streng. Når proxyen svarer OK fra `v1.0`, fungerer dialogen som før.

### Antakelser
- DJI sin OpenAPI-doc tittel «V1.0» reflekterer at livestream-modulen er publisert under `/openapi/v1.0/`. Hvis det viser seg at endepunktet faktisk forventer en helt ny path (f.eks. `/openapi/v1.0/livestream/start` uten bindestrek), vil `attempts`-loggen vise 404 og vi justerer raskt basert på respons.
- Token og HMAC-signering er identisk på tvers av `v0.1` og `v1.0` (kjent fra DJI sine eksempler).

### Filer som endres
- `supabase/functions/flighthub2-proxy/index.ts`

### Resultat
Livestream-kallet treffer riktig API-versjon (`v1.0`), `200500`-feilen forsvinner, og vi får en gyldig WHEP-URL tilbake. Diagnoseverktøyet kan i tillegg teste andre `v1.0`-endepunkter direkte fra admin-panelet.

