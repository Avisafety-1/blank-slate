# Implementering ferdig

## Hva som er gjort

Erstattet TypeScript Fly-appen med Rust + `dji-log-parser` (Lucas Vauvillier).
Den støtter nå krypterte v13+ logger fra DJI Fly / Pilot 2.

### Filer endret
- `dji-parser/Cargo.toml` (NY)
- `dji-parser/src/main.rs` (NY) — axum HTTP-server, multipart `/parse`
- `dji-parser/Dockerfile` — multi-stage Rust build
- `dji-parser/README.md` — ny dokumentasjon
- `dji-parser/.dockerignore` — oppdatert for Rust
- `dji-parser/src/parser/*` (SLETTET — gammel TS)
- `dji-parser/package.json`, `tsconfig.json`, `node_modules` (SLETTET)
- `supabase/functions/dji-parse-proxy/index.ts` — nytt frame-format mapping

### Hva brukeren må gjøre

1. **Skaff DJI API-nøkkel** fra https://developer.dji.com/ (kan ta dager).
2. **Sett Fly secrets:**
   ```
   fly secrets set DJI_API_KEY=<api-nøkkel> --app avisafe-djilog-parser
   ```
   `AVISAFE_PARSER_TOKEN` er allerede satt.
3. **Deploy Fly-appen:**
   ```
   cd dji-parser
   fly deploy --app avisafe-djilog-parser
   ```
4. Test opplasting av `DJIFlightRecord_2025-12-18_[13-19-15].txt`.

### Fallback
Edge functions faller fortsatt tilbake til DroneLog API hvis Fly returnerer
`{ fallback: true }` (f.eks. mens DJI_API_KEY ikke er satt).
