## Problem

På DJI RC Plus 1 (Chromium 70) krasjer appen når man åpner en PDF-sjekkliste:
`TypeError: Promise.withResolvers is not a function`

Dette er en ES2024-funksjon som `pdfjs-dist@4.4.168` (brukt via `react-pdf` i bl.a. `ChecklistExecutionDialog`) kaller internt. Chromium 70 mangler den, så hele React-treet kastes til ErrorBoundary. Andre enheter (iPad, telefon) har moderne nettlesere og ser ikke feilen.

## Løsning

Last en liten polyfill helt øverst i `src/main.tsx` (før noen andre imports), slik at den finnes når pdf.js initialiseres. Polyfillen er no-op på moderne nettlesere.

## Endringer

**Ny fil: `src/lib/legacyPolyfills.ts`**
- Definer `Promise.withResolvers` hvis den mangler (standard implementasjon: returner `{ promise, resolve, reject }`).
- Samme fil får også en sikkerhetsnett-polyfill for `Array.prototype.at` (ES2022) som pdf.js og andre nyere libs ofte bruker. No-op hvis allerede definert.
- Ingen avhengigheter, ingen sideeffekter på moderne nettlesere.

**Oppdater `src/main.tsx`**
- Legg til `import "./lib/legacyPolyfills";` som aller første linje, før alle andre imports, slik at polyfillen er på plass før React, pdf.js eller andre moduler evalueres.

## Hva som IKKE endres

- Ingen oppgradering/nedgradering av `pdfjs-dist` eller `react-pdf`.
- Ingen endring i PDF-renderingslogikken (`ChecklistExecutionDialog`, `TrainingCourseEditor`, `AICourseGeneratorDialog`).
- Ingen build-config-endringer (Vite target, browserslist).

## Verifisering

- På moderne nettlesere: ingen synlig endring (polyfill hopper over når funksjonen finnes).
- På DJI RC Plus: sjekklist-PDF skal nå åpnes uten ErrorBoundary-krasj.
