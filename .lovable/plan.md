
## Problem

På iPhone (Safari/Gmail in-app browser) skjer to ting når brukeren åpner en sjekkliste fra «Start flytur»:

1. **Sjekklisten laster ikke** i `ChecklistExecutionDialog` – siden står tom (skjermbilde viser kun en blå progressbar i en ny fane).
2. Når brukeren trykker «Åpne sjekkliste» åpnes signed URL i ny fane via `window.open(...)`. iOS Safari laster da PDF-en ned som vedlegg i stedet for å vise den, fordi Supabase Storage signed URLs sender `Content-Disposition: attachment` for PDF-er.
3. «Last inn på ny» nederst i Safari trigger krasj fordi dialogen ikke håndterer reload-state.

Bildet/PDF-en lastes egentlig fint (signed URL fungerer på desktop), problemet er ren mobilrendering + at vi sender brukeren ut av appen.

## Plan

Endre kun `src/components/resources/ChecklistExecutionDialog.tsx` (frontend/presentasjon):

### 1. Behandle PDF som egen modus
Utvid `getFileMode()` til å returnere `"pdf" | "image" | "document" | null`. PDF får dedikert rendering.

### 2. Render PDF inline i dialogen
For `fileMode === "pdf"`:
- Bruk `<iframe src={fileUrl} className="w-full h-[60vh] rounded-lg border" title="Sjekkliste PDF" />` slik at PDF-en vises direkte uten å forlate appen.
- Behold «Åpne i ny fane»-knapp som sekundær handling for de som vil ha større visning.
- iOS Safari rendrer PDF i iframe inline (i motsetning til `window.open` på en `Content-Disposition: attachment`-URL som tvinger nedlasting).

### 3. Be Supabase om inline-visning der mulig
Når vi genererer signed URL, legg til `?download=` parameter fjernet og bruk `transform`-fri kall – men viktigste fix er at PDF-rendering skjer via `<iframe>`, ikke `window.open`.

### 4. Reload-stabilitet
Sett iframe `key={fileUrl}` slik at Safari-reload ikke beholder gammel state, og clear `fileUrl` ved dialog-close (allerede gjort ved tab-change, må også ved `onOpenChange(false)`).

### Andre filtyper
- `image` – uendret (vises allerede inline).
- `document` (Word/Excel/etc.) – uendret, fortsatt «Åpne dokument»-knapp (kan ikke renderes inline uansett).

## Teknisk notat

- Ingen endringer i edge functions, DB eller storage policies.
- Ingen endringer i opplastings-/upload-flyten.
- Kun frontend i én fil: `ChecklistExecutionDialog.tsx`.
- Behold eksisterende «Marker som utført»-knapp under PDF-en.
