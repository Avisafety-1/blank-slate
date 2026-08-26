# DJI: henter for få logger i importdialogen

## Hva som er galt

To konkrete feil i DJI-importdialogen (`UploadDroneLogDialog`), bekreftet i koden:

1. **Sidestørrelsen er 20.** Klienten sender alltid `limit: 20` til `dji-list-logs`. Nattsynken (`dji-sync-enqueue`) bruker til sammenligning `limit=200` mot samme DroneLog-endepunkt. Derfor ser brukeren bare 20 av 43 logger.

2. **"Last inn flere" paginerer feil vei.** Knappen sender `createdAfterId` = id-en til den *siste* (eldste) loggen i listen. `createdAfterId` betyr "logger opprettet etter denne id-en", altså *nyere* logger. Resultatet blir at samme sett hentes på nytt — det stemmer med at brukeren fikk duplikater fra 20. august. Det finnes heller ingen dedupe på id ved append, så duplikatene legges rett inn i listen.

## Fiks

- Hent en full batch med én gang: send `limit: 200` (samme som nattsynken) i stedet for 20.
- Fjern den feilrettede `createdAfterId`-pagineringen fra "Last inn flere". Med 200 i én batch dekkes praktisk talt alle reelle tilfeller; knappen skjules når svaret inneholder færre enn maks.
- Legg inn dedupe på `id` når logger settes/legges til i listen, slik at duplikater aldri kan vises selv om API-et returnerer overlapp.
- Behold nedstigende sortering på tidsstempel.

## Teknisk

- `src/components/UploadDroneLogDialog.tsx`:
  - `fetchDjiLogs`: `payload.limit = 200`, dedupe mappede logger på `id`, sett `djiHasMore` kun når `rawLogs.length >= 200`.
  - "Last inn flere"-knappen: fjernes (eller beholdes kun som ren re-fetch uten `createdAfterId`).
- `supabase/functions/process-dronelog` trenger ingen endring — den videresender `limit` som gitt, med default 20.
- Ingen databaseendringer.

## Verifisering

- Logg inn i DJI-fanen, bekreft at antall listede logger stemmer med antallet i DJI-skyen (43 i brukerens tilfelle), og at ingen id vises to ganger.
