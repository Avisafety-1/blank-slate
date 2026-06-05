## Problem

Vi har blandet sammen to forskjellige FH2-funksjoner:

- **Airspace Management** (push fra DJI → oss): DJI sender drone-tracks fra organisasjonens egne droner til vår webhook via HMAC-signert POST. Dette har vi implementert i `flighthub2-airspace-webhook` og det fungerer.
- **Third-Party Airspace Data Configuration** (pull fra DJI ← oss): Skjermbildet du viser. Her henter FH2 **sivil flytrafikk** fra vår URL for å vise annen lufttrafikk i FH2-kartet. Dette er en helt annen kontrakt — DJI kaller GET med en API-key, ikke HMAC-signert POST.

Vi gjenbruker i dag `flighthub2-airspace-webhook` til å svare på `GET /v1/uav` med tom liste. Det er en gjetning som "går igjennom" Verify, men vi vet ikke:
- Hvilken path DJI faktisk treffer
- Hvilke query-parametre (lat/lng/radius? bbox? zoom?)
- Hvilket auth-headerformat (Bearer? X-API-Key? query-param?)
- Hvilket JSON-format svaret må ha for at trafikk skal vises i FH2

Derfor ser Tensio ingen sivil trafikk i FH2 — vi sender bare `[]`.

## Løsning: Logge-først, bygge etterpå

### Steg 1 — Ny edge function `flighthub2-airspace-feed`

Separat funksjon (ikke gjenbruke webhook). `verify_jwt = false`. Aksepterer **alle** metoder og paths under funksjonsroten.

Oppførsel:
1. Logger hver request fullstendig til ny tabell `fh2_airspace_feed_log` (metode, full path, query-string, alle headers, body, remote IP, timestamp).
2. Henter API-key fra: `Authorization: Bearer …`, `X-API-Key`, eller query-param `api_key` / `apikey` / `key` — sjekker hver kandidat mot lagret nøkkel (konstanttidssjekk).
3. Hvis nøkkel matcher → returnerer `200 OK` med både `{"status":"ok"}` og en tom array-versjon avhengig av path (vi prøver begge varianter inntil vi vet hva DJI forventer).
4. Hvis nøkkel mangler/feil → `401` (logges også).
5. Health-endepunkt: `GET /` og `GET /health` returnerer `OK` uten auth-krav, slik at vi kan teste at funksjonen lever.

### Steg 2 — Database

Ny tabell `public.fh2_airspace_feed_log`:
- `company_id` (nullable inntil vi vet hvordan vi mapper)
- `method`, `path`, `query`, `headers` (jsonb), `body_preview` (text, første 2000 tegn), `remote_ip`, `status_returned`, `matched_key` (bool), `created_at`
- RLS: kun admin/superadmin i selskap kan lese egne rader; service_role full tilgang.

Ny tabell `public.fh2_airspace_feed_config`:
- `company_id` (unique), `enabled`, `api_key_encrypted` (pgp_sym_encrypt med `FH2_ENCRYPTION_KEY`), `created_at`, `updated_at`, `last_request_at`.
- RLS: admin i selskapet kan lese/oppdatere.
- RPC `save_fh2_feed_key(p_company_id, p_key, p_enc_key)` og `get_fh2_feed_key_by_lookup(p_key_candidate, p_enc_key) returns company_id` for å slå opp uten å eksponere alle nøkler.

### Steg 3 — UI

I `FH2AirspaceWebhookSection` (eller ny seksjon `FH2AirspaceFeedSection`):
- Vis funksjons-URL: `https://pmucsvrypogtttrajqxq.functions.supabase.co/flighthub2-airspace-feed`
- Generér tilfeldig API-key (32–48 tegn), vis én gang, lagres kryptert.
- Toggle: Aktiver feed.
- Liste over de siste 20 loggrad-radene (metode + path + status + tid) så Tensio ser hva DJI faktisk spør om når de trykker Verify.

### Steg 4 — Verifiser med DJI

Etter at Tensio limer inn URL + API-key og trykker **Verify**:
1. Vi leser `fh2_airspace_feed_log` og ser eksakt request-format.
2. Da bygger vi riktig JSON-feed (sannsynligvis liste over fartøy med `lat`, `lon`, `alt`, `callsign`, `course`, `speed`, `type`, `timestamp`) som henter fra `safesky_traffic_cache` / `barentswatch_ais` filtrert til radius rundt forespurt punkt.

### Steg 5 — Bygg riktig feed (oppfølgings-PR)

Når vi vet kontrakten:
- Mapper sivil trafikk (SafeSky + evt. Avinor) inn i DJIs format.
- Cache 5–15 s per (lat,lng,radius)-celle for å unngå rate-limits.
- Behold den nye loggetabellen for fremtidig debugging, men logg bare avviste / sjeldne requests.

## Hva som IKKE endres

- `flighthub2-airspace-webhook` (push-mottak fra DJI) er korrekt og rørt ikke.
- `flighthub2-proxy` (vår klient mot FH2 OpenAPI v0.1) er ikke berørt.
- Eksisterende posisjonslagring (`flighthub2_positions`) brukes som før.

## Teknisk

- `verify_jwt = false` settes i `supabase/config.toml` for `flighthub2-airspace-feed`.
- Krypteringsnøkkel: bruker eksisterende `FH2_ENCRYPTION_KEY` — ingen ny secret nødvendig.
- Loggetabellen får automatisk `DELETE` etter 14 dager via en `cron` cleanup-jobb (samme mønster som `audit_log`).
