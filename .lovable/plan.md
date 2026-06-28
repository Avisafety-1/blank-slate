## Problem
Batch-loggingspanelet rendres riktig i koden, men de ytre container-conditionals i `UploadDroneLogDialog.tsx` aktiverer split-view kun når `selectedPendingLogId && result` er sant. Når man bare har batch-utvalg (uten enkeltvalgt logg), faller dialogen tilbake til enkolonnemodus (`max-w-lg`, ingen flex), så BatchLogPanel havner under listen i stedet for på høyre side.

## Fix
Utvid de to conditionals slik at split-view også slår inn ved batch-utvalg.

### Endringer i `src/components/UploadDroneLogDialog.tsx`

1. **Linje 3231** — DialogContent-bredde:
   - Erstatt `step === 'method' && selectedPendingLogId && result`
   - med `step === 'method' && ((selectedPendingLogId && result) || batchSelectedIds.size > 0)`
   - Dette gjør at dialogen utvider seg til `max-w-5xl h-[95vh] flex flex-col` også i batchmodus.

2. **Linje 3241** — ytre wrapper for method-step:
   - Samme utvidelse av condition slik at den ytre `<div>`-en får `flex gap-6 h-full flex-1 min-h-0`.

3. **Linje 3243** — venstre kolonne (metode + pending-liste):
   - Samme utvidelse slik at venstrekolonnen får `w-1/3 min-w-[280px] shrink-0 flex flex-col min-h-0 overflow-y-auto pr-1`, og BatchLogPanel på høyre side får sin egen `flex-1`-kolonne (allerede korrekt rendret på linje 3409–3431).

Ingen endring i BatchLogPanel selv — den er allerede plassert riktig i JSX, problemet er bare at foreldrene ikke aktiverer flex-layout uten enkeltvalgt logg.

## Verifisering
- Åpne dialog, huk av flere ventende logger → dialogen skal utvide seg, listen smal til venstre, BatchLogPanel til høyre.
- Huk av alle bort → dialogen krymper tilbake til enkolonne.
- Single-klikk på en logg uten batchvalg → fortsetter å fungere som før.