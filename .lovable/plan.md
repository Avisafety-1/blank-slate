## Bakgrunn

Forrige runde fikset `dji-process-single` og `dji-auto-sync`, men **`process-dronelog`** har en tredje instans av URL-mode-flyten som vi ikke rørte. Den ligger i `dji-process-log`-action (linje 956-981) og er den som UI-en faktisk kaller fra `UploadDroneLogDialog.tsx` (linje 70). Det er denne som returnerer 502 med `"DroneLog API error (process-url)"` du ser nå.

## Endring

Erstatt URL-mode-fallbacken i `supabase/functions/process-dronelog/index.ts` (linje 956-981, inne i `action === "dji-process-log"`-blokken) med last-ned-og-upload-flyten:

```text
download fil fra DJI Cloud (med dronelogKey)
  ↓ ZIP-detect på magic bytes "PK\x03\x04"
upload til DroneLog /logs/upload som multipart
  ↓ ved 500 på .zip
ZIP→TXT→reZIP-fallback (samme som uploadAndParse i de andre funksjonene)
```

Fly-parser-førsteforsøket (linje 933-954) beholdes uendret — kun fallbacken under endres.

## Hva endres IKKE

- Fly-parser-blokken (linje 933-954) — vil tas i bruk automatisk når Rust-appen din kjører.
- Manuell file-upload-flyt (linje 1100+) — fungerer allerede via samme /logs/upload.
- `dji-process-single` og `dji-auto-sync` — endret forrige runde.

## Forventet resultat

- 502-feilen forsvinner. DJI Cloud-prosessering fra UI bruker samme stabile flyt som manuell opplasting.
- Når Rust-Fly-parseren kjører, slipper vi DroneLog-kvote helt for de filene den støtter.
