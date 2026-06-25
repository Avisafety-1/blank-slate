## Problem

"Last ned dokument"-knappen gjør ingenting på mobil. Årsaken er at den nåværende implementasjonen:

1. Kjører en `async fetch()` før nedlasting starter → bryter user-gesture-kjeden som mobile Safari/Chrome krever for at nedlasting/popup skal tillates.
2. Bruker `<a download>` mot en cross-origin URL (Supabase Storage) — `download`-attributtet ignoreres da av nettleseren, så ingenting skjer.
3. Hvis `fetch` feiler (CORS, nettverk), faller den tilbake til `window.open` — men dette skjer asynkront og blokkeres ofte uten synlig feilmelding.

## Løsning

Bruk Supabase Storage sitt innebygde `?download=<filnavn>` query-parameter på den signerte URL-en. Da returnerer Supabase `Content-Disposition: attachment`, og nettleseren tvinger nedlasting uavhengig av origin — også på iPhone.

### Endringer i `src/components/resources/ChecklistExecutionDialog.tsx`

1. **Forenkle `handleOpenFile`** til en synkron funksjon:
   - For `image` / `pdf`: `window.open(fileUrl, "_blank")` som før.
   - For alt annet (docx, doc, xlsx, ukjent): legg til `?download=<filnavn>` (eller `&download=` hvis URL-en allerede har query) på `fileUrl` og naviger via et midlertidig `<a>`-element med `target="_blank"` opprettet og klikket synkront i samme onClick-tick.
2. Fjern `fetch`/`blob`-koden helt — den er ikke nødvendig når Supabase håndterer Content-Disposition serverside.
3. Bevar fallback-loggen ved feil, men ingen async fallback som bryter gesten.

Ingen andre filer eller logikk endres (sjekklister, signatur, PDF/bilde-visning, mammoth-konvertering forblir uendret).

### Verifisering

- iPhone 13 Pro (Safari): trykk "Last ned dokument" på en .docx-sjekkliste → filen lastes ned med riktig navn.
- Desktop Chrome: samme oppførsel, fil havner i nedlastingsmappen.
- PDF/bilde: åpnes fortsatt i ny fane som før.
