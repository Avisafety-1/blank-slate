## Bakgrunn

DroneLog API fungerer igjen, og Fly-parser-forsøket ligger i hver edge-funksjon som første steg med fallback til DroneLog. Når Fly-parseren feiler eller ikke er konfigurert, koster det ekstra tid og logging før vi havner på DroneLog uansett. Siden vi vil bruke DroneLog som primær kilde nå, kobler vi ut Fly-forsøket helt.

## Endringer

Fjern Fly-parser-forsøket fra disse tre edge-funksjonene, slik at de går rett til DroneLog `/logs/upload`:

1. **`supabase/functions/process-dronelog/index.ts`**
   - Fjern Fly-blokken i `dji-process-log`-action (rundt linje 933-954) — gå rett til last-ned + `uploadDjiBytes` til DroneLog.
   - Fjern Fly-forsøket i manuell upload-flyt (linje 1164) — `uploadAndParse` direkte.
   - La `tryFlyParser`-funksjonen og `DJI_PARSER_URL`/`DJI_PARSER_TOKEN`-konstantene ligge urørt (eller fjern dem hvis de blir helt ubrukte) — vi beholder dem hvis vi vil reaktivere senere.

2. **`supabase/functions/dji-process-single/index.ts`**
   - Fjern Fly-blokken (linje 370-378 ish) i `processLogByUrl` — last ned + `uploadAndParse` direkte.

3. **`supabase/functions/dji-auto-sync/index.ts`**
   - Fjern Fly-blokken (linje 373-381 ish) i `downloadAndParseLog` — samme: last ned + `uploadAndParse` direkte.

## Hva endres IKKE

- **`dji-parser/`-mappen** (Rust/Fly-app, Dockerfile, fly.toml) — beholdes urørt for senere bruk.
- **`supabase/functions/dji-parse-proxy/index.ts`** — beholdes urørt; ingen kaller den i produksjonsflyten lenger, men koden ligger klar.
- **`process-ardupilot`** — bruker en separat ArduPilot-parser, ikke berørt.
- **DroneLog upload-helperne** (`uploadDjiBytes`, `uploadAndParse`, ZIP→TXT-fallback) — beholdes som de er.

## Forventet resultat

- DJI Cloud-prosessering og manuell opplasting går rett til DroneLog uten Fly-omvei.
- Ingen forsinkelse fra mislykkede Fly-kall, ingen `[fly-parser]`-støy i loggene.
- Mulig å reaktivere Fly senere ved å sette inn igjen et lite `tryFlyParser`-kall foran DroneLog-kallet.
