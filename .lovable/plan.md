## Bakgrunn

Du har rett — `dji-process-single` (og `dji-auto-sync` for cloud) bruker nå **URL-mode** mot DroneLog (`POST /logs` med `{url, fields}`), som krever at DroneLog selv kan hente filen fra `…/logs/{accountId}/{logId}/download`. Dette feiler ofte (404/timeouts) fordi:

- DroneLog må re-autentisere mot DJI Cloud for å hente filen, og signed URL-en er kortvarig.
- Vår egen Fly-parser returnerer 422 på alle filer (gammel Node-app som ikke støtter DJI-formatet), så vi faller tilbake til DroneLog URL-mode — som så feiler.

Den **gamle, stabile flyten** var: edge function laster ned filen først (med vår dronelogKey), og POSTer **selve filbytene** til `POST /logs/upload` som multipart. Det fungerer alltid fordi DroneLog ikke trenger å snakke med DJI Cloud i det hele tatt.

`uploadAndParse()`-funksjonen finnes allerede i begge filer (linje 254 i `dji-process-single`, linje 268 i `dji-auto-sync`) — vi trenger bare å rute Cloud-flyten gjennom den.

## Hva endres

### 1. `supabase/functions/dji-process-single/index.ts`

Erstatt `processLogByUrl()`-flyten i hovedhandleren (rundt linje 536-557) med:

```text
download fil fra DJI Cloud (med dronelogKey)
  ↓ (følg redirects, hent bytes)
forsøk Fly-parser hvis konfigurert (eksisterer allerede)
  ↓ hvis 422/feil
uploadAndParse(dronelogKey, bytes, ".txt", logId)   ← gammel, stabil flyt
```

Konkret:
- Behold `tryFlyParserCsv()` som førsteforsøk (når den nye Rust-appen er deployet vil den fungere her).
- Erstatt `processLogByUrl()` slik at fallback ikke lenger er `POST /logs` URL-mode, men `uploadAndParse(dronelogKey, bytes, ".txt", logId)`.
- Hvis nedlasting feiler med 4xx → returner `download_failed` som før.

### 2. `supabase/functions/dji-auto-sync/index.ts`

Samme endring i `downloadAndParseLog()` (kalt linje 762): bytt URL-mode-fallback til `uploadAndParse()`-flyten.

### 3. `supabase/functions/dji-parse-proxy/index.ts`

Ingen endring nødvendig — denne funksjonen brukes kun av `process-dronelog` (manuell file upload-flyt) og fungerer som den skal: forsøker Fly-parser, faller tilbake til DroneLog `/logs/upload` ved 422.

## Hva endres IKKE

- `process-dronelog` (manuell upload) — bruker allerede `dji-parse-proxy` som faller tilbake riktig.
- Fly-parseren (`dji-parser/`) — den er allerede oppdatert til Rust 1.90, og når du får deployet den vellykket vil den brukes som førsteforsøk i alle tre flyter automatisk.
- DroneLog API-nøkkel-håndtering, login, retry på rate-limit, error-koder.

## Forventet resultat

- DJI Cloud-prosessering vil fungere igjen (samme stabilitet som før vi byttet til URL-mode).
- Når Rust-Fly-parseren etterhvert kjører vellykket, vil den ta over som førsteforsøk uten ytterligere endringer — DroneLog blir kun fallback.
- Du sparer DroneLog-kvote på alle filer Rust-parseren klarer (når den kjører).

## Risiko

- DroneLog `/logs/upload` har en MIME-type-quirk (Laravel finfo) som krever `.zip`-ekstensjon for binære DJI-filer — håndteres allerede i `uploadAndParse()` med `ZIP→TXT→re-ZIP`-fallback (linje 283-298). Beholdes som er.
