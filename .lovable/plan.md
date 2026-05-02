
## Bakgrunn

Loggen din (`DJIFlightRecord_2025-12-18`) er **fullt kryptert** (entropi ~7.91). Det er ikke et parser-format-problem — det er DJI log version ≥13, som krever per-fil **keychains** hentet fra DJI sin offisielle API med en API-nøkkel. Vår nåværende TypeScript-parser kan aldri dekryptere dette uten den nøkkelen.

[`lvauvillier/dji-log-parser`](https://github.com/lvauvillier/dji-log-parser) (Rust, vedlikeholdt, MIT) løser nettopp dette:
- Leser version fra header (uten nøkkel)
- For v13+: kaller DJI sitt keychain-API med din `DJI_API_KEY`
- Dekrypterer records, normaliserer til `Frame`-struktur
- Innebygd CLI med `--csv`, `--kml`, `--geojson`, `--images`, `--thumbnails`

## Forutsetning (du må gjøre dette)

Skaff en **DJI API-nøkkel** fra DJI Developer (https://developer.dji.com/). Nøkkelen brukes server-side mot DJI sitt keychain-endpoint. Uten denne kan vi ikke dekryptere v13+ logger uansett hvilken parser vi bruker.

Når du har nøkkelen, lagrer du den som Fly.io secret (`DJI_API_KEY`) — jeg legger til oppskrift i Fly-appen.

## Plan

### 1. Bygg om Fly.io-appen til Rust + dji-log-parser CLI

Erstatt dagens Node/TypeScript Fly-app med en slank Rust-binary som wrapper CLI-en:

```text
dji-parser/
├── Dockerfile          # multi-stage: rust:1-slim build → debian-slim runtime
├── Cargo.toml          # axum + tokio + dji-log-parser
├── fly.toml            # uendret app-navn
└── src/main.rs         # POST /parse + GET /health
```

`POST /parse` (multipart):
- `file` — DJI .txt eller .zip
- `format` — `json` (default), `csv`, `kml`, `geojson`
- `Authorization: Bearer ${AVISAFE_PARSER_TOKEN}` (uendret)

Internt:
1. Skriv upload til `/tmp/<uuid>.txt`
2. Kjør `dji-log --api-key $DJI_API_KEY --output - <fil>` (eller bruk biblioteket direkte for å unngå subprocess)
3. Returner stdout som JSON/CSV til kaller

Bruk biblioteket direkte (ikke CLI) — gir bedre feilhåndtering og lar oss konvertere `Frame[]` → samme CSV-form som DroneLog returnerer, slik at edge functions ikke trenger endring.

### 2. Hold fallback-kjeden uendret

Edge functions (`dji-parse-proxy`, `process-dronelog`, `dji-process-single`) trenger ingen endring. De fortsetter å:
- Prøve Fly først
- Falle tilbake til DroneLog API hvis Fly returnerer `{ fallback: true }`

Fly returnerer `fallback: true` kun hvis:
- `DJI_API_KEY` mangler
- DJI keychain-API svarer 401/403 (ugyldig nøkkel)
- Filen er korrupt

### 3. Slett dagens TypeScript-parser-logikk

`dji-parser/src/parser/dji-txt.ts` og resten under `dji-parser/src/` slettes. Erstattes av Rust-koden over. `dji-parser/README.md` oppdateres med ny build/deploy-instruks og krav om `DJI_API_KEY` secret.

### 4. Behold `parseDetails` heuristikk som siste skanse

I tilfelle `dji-log-parser` selv feiler på et spesifikt format, beholder vi en minimal "details only"-extractor som returnerer aircraftSN/startTime fra cleartext header — bedre enn ingenting for missions-matching.

## Tekniske detaljer

**Cargo.toml:**
```toml
[dependencies]
dji-log-parser = "0.5"
axum = { version = "0.7", features = ["multipart"] }
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.5", features = ["limit"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
```

**Output mapping** (Rust `Frame` → DroneLog CSV-kolonner):
- `frame.osd.latitude` → `OSD.latitude`
- `frame.osd.altitude` → `OSD.altitude [m]`
- `frame.battery.charge_level` → `BATTERY.chargeLevel [%]`
- `frame.battery.cell_voltages[i]` → `BATTERY.cellVoltage{i+1} [V]`
- osv.

Mappingen ligger i `src/main.rs::frame_to_csv_row()` så vi beholder eksisterende `parseCsvToResult` i edge functions urørt.

**Fly secrets:**
```
fly secrets set DJI_API_KEY=<din-nøkkel> --app avisafe-djilog-parser
```

**Image size:** Rust statisk linket → ~15 MB image (mot dagens ~150 MB Node). Raskere cold start.

## Hva du må gjøre etter godkjenning

1. Hent DJI API-nøkkel fra developer.dji.com (kan ta 1-3 dager å få godkjent)
2. Når du har den: si fra, så setter jeg `fly secrets set DJI_API_KEY=...` (eller du gjør det selv)
3. Test opplasting av samme `DJIFlightRecord_2025-12-18`-fil

## Hva som IKKE løses

- DroneLog fallback-feil (422). Vi kan debugge den separat hvis du vil — men når DJI-nøkkelen er på plass, vil Fly-parseren håndtere alle nyere logger og DroneLog blir kun fallback for eldre/eksotiske formater.
