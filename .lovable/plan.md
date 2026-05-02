Vi bygger en egen Fly.io-app som **kun** parser DJI-loggfiler (.txt/.zip). Innlogging og listing av logger fra DJI Cloud fortsetter via DroneLog API.

## Ansvarsfordeling

| Steg | Hvem |
|---|---|
| Logge inn på DJI-konto (`POST /accounts/dji`) | DroneLog (uendret) |
| Hente liste over logger fra DJI Cloud (`GET /logs/{accountId}`) | DroneLog (uendret) |
| Hente `downloadUrl` for en spesifikk logg | DroneLog (uendret) |
| Laste ned selve loggfilen fra DJI | AviSafe edge function |
| **Parse logg → JSON med alle felter** | **Ny Fly.io-app** |
| Lagre `flight_logs` / oppdatere `pending_dji_logs` | AviSafe edge function (uendret) |

## Arkitektur

```text
DJI Cloud login + list  ─────►  DroneLog API
                                     │
                                     ▼ downloadUrl
AviSafe edge function ──── GET ────► DJI server
       │  (laster ned .txt/.zip)
       ▼
   Fly.io app  (avisafe-djilog-parser)
       │  POST /parse  (multipart fil + ønskede felter)
       │  Kø + worker
       ▼
   JSON respons (samme form som dagens DroneLogResult)
       │
       ▼
   Edge function lagrer i Supabase
```

Resultat-JSON er **identisk** med dagens `parseCsvToResult`/`parseCsvMinimal`-output, slik at frontend, `flight_logs`-skjema og `pending_dji_logs`-flyt ikke trenger noen endringer.

## Fly.io-appen

Mappe: `dji-parser/` (samme stil som eksisterende `ardupilot-parser/`).

```text
dji-parser/
├── Dockerfile
├── fly.toml
├── package.json
├── tsconfig.json
└── src/
    ├── server.ts        Fastify, /parse, /health
    ├── queue.ts         BullMQ + Upstash Redis
    ├── worker.ts        prosesserer jobber
    ├── parser/
    │   ├── index.ts     entrypoint: bytes → records
    │   ├── unzip.ts     håndterer .zip wrapper
    │   ├── dji-txt.ts   DJI binærparser
    │   └── fields.ts    samme FIELDS-liste som DroneLog bruker i dag
    └── types.ts
```

### Endepunkter

- `POST /parse` — multipart med `file` + `fields` (CSV-liste). Synkron for små filer (<10 MB), returnerer JSON. Bearer-auth med `AVISAFE_PARSER_TOKEN`.
- `POST /jobs` — async variant for store filer; returnerer `jobId`. Callback signert med HMAC.
- `GET /jobs/:id` — status + resultat.
- `GET /health` — for Fly healthcheck.

### Robusthet

- BullMQ + Upstash Redis: retries (3, eksponentiell backoff), DLQ, idempotens på `jobId`.
- Concurrency 2 per maskin, Fly auto-scale 1–3 maskiner, `min_machines_running = 1` for å unngå kald start.
- 120 s timeout per jobb, 512 MB memory.
- Strukturerte logger (pino), `/health` og `/metrics` (queue depth, jobs/min).
- Bearer-token på inn, HMAC-signatur på callback.

### DJI-parser

TypeScript-port av DJI flight record-formatet:

- `.zip` wrapper → unzip → finn `.txt`.
- DJI .txt: header med offset-tabell, scrambled records (XOR-key fra header), record types (OSD, HOME, GIMBAL, RC, BATTERY, CUSTOM, DEFORM, CENTER_BATTERY, RC_GPS, RC_DEBUG, RECOVER, APP_TIP, APP_WARN, RC_FUNC, GIMBAL_USER, APP_OPERATION, APP_GPS, FLYC_DEBUG, MOTOR_CTRL, FAULT_INJECT, JPEG, OTHER).
- Output: array av records per type → flatet ut til samme felt-navn DroneLog bruker (`OSD.latitude`, `BATTERY.chargeLevel [%]`, osv. — se `docs/dronelog-api-fields.md`).
- Beregnede felter (`CALC.*`, `BATTERY.cellVoltageDeviation`, `BATTERY.maxCellVoltageDeviation`) regnes ut etter parsing.

Versjonsstøtte: starter med moderne formater (Mavic 3, Matrice 4D/4TD, M30/M300, M400). Eldre/ukjente versjoner → returnerer 422 og edge function fall-back til DroneLog `/logs/upload`.

## Endringer i AviSafe

### 1. Ny edge function `dji-parse-proxy`

Erstatter den feilende `/logs/upload`-stien i alle tre funksjoner (`process-dronelog` action `dji-process-log`, `dji-process-single`, `dji-auto-sync`).

Flyt:
1. Hent `downloadUrl` fra DroneLog-listen (allerede tilgjengelig).
2. `GET downloadUrl` med DroneLog Bearer-token → bytes.
3. `POST {parserUrl}/parse` med fil + fields.
4. Hvis 200 → returner JSON.
5. Hvis 422 (ukjent versjon) eller 5xx → fall tilbake til `POST /logs/upload` mot DroneLog (dagens kode beholdes som backup).

### 2. Endre eksisterende edge functions

- `process-dronelog` (`dji-process-log` action): kall `dji-parse-proxy` i stedet for `/logs/upload`.
- `dji-process-single`: samme.
- `dji-auto-sync`: samme.
- Manuell brukeropplastet fil i `process-dronelog` (uten DJI Cloud): også via `dji-parse-proxy`, fall-back til DroneLog `/logs/upload`.

### 3. Ingen DB-endringer

Ingen nye tabeller. Eksisterende `flight_logs` / `pending_dji_logs` brukes som nå.

### 4. Secrets

Legges til i Lovable Cloud:
- `DJI_PARSER_URL` — f.eks. `https://avisafe-djilog-parser.fly.dev`
- `DJI_PARSER_TOKEN` — bearer-token til Fly-appen

På Fly:
- `AVISAFE_PARSER_TOKEN` — samme som over
- `UPSTASH_REDIS_URL`

## Migreringsplan

1. **Bygg Fly-appen** med minimal parser (OSD + DETAILS + BATTERY) + kø + auth.
2. **Shadow-test**: legg inn `dji-parse-proxy` med toggle av som default. Kjør 50 logger gjennom parseren manuelt og sammenlign output med DroneLog. Verifiser GPS-koordinater, høyde, hastighet, batteri.
3. **Utvid parser** til full feltdekning (gimbal, RC, weather, calc).
4. **Skru på proxy** i `dji-process-single` og `dji-auto-sync` med fall-back til DroneLog.
5. **Skru på proxy** i manuell `dji-process-log`.
6. Etter 2 uker uten regressions: behold DroneLog kun for login + listing.

## Hva jeg trenger fra deg

Jeg har 2 valg jeg vil bekrefte før implementasjon — vil du at jeg stiller dem nå (Redis-leverandør og om vi skal sette opp HMAC-callback eller holde alt synkront i første versjon)? Eller bare velge defaults (Upstash + synkron først, async-kø som steg 2)?