# Fiks: Batch-import av flylogger – siste logg og «Lagre alle»-knappen kan ikke nås

## Problem
I «Last opp flylogg»-dialogen i batch-modus (flere DJI-logger valgt) vokser innholdet ut av dialogen, slik at den siste loggen og «Lagre alle»-knappen ikke kan skrolles til.

## Diagnose (bekreftet i koden)
I `src/components/UploadDroneLogDialog.tsx` (linje 3549) settes batch-dialogen til `h-[95vh] flex flex-col` — men shadcn `DialogContent` (`src/components/ui/dialog.tsx`) har `grid` i basis-klassene. Når både `grid` og `flex` er satt vinner `grid` i Tailwinds genererte CSS (grid kommer etter flex i stylesheet-rekkefølgen). Dialogen blir dermed **ikke** en flex-kolonne:

- Rad-containeren (linje 3559) bruker `h-full flex-1 min-h-0`. `flex-1` gjør ingenting i en grid, og `h-full` (= 95vh) gjelder *i tillegg til* headeren → innholdet blir høyere enn dialogen.
- Dialogen har ingen `overflow-y-auto` i batch-grenen, så det som havner utenfor er umulig å nå.
- `ScrollArea` i `BatchLogPanel.tsx` arver da ingen reell begrenset høyde, og listen vokser fritt.

## Fiks
1. **`UploadDroneLogDialog.tsx` (batch/split-grenen):**
   - Gjør layouten robust: behold `flex flex-col` men tving den med `!flex` (eller bruk `grid-rows-[auto_minmax(0,1fr)]`), og legg til `overflow-hidden` i 95vh-grenen slik at ingenting kan havne utenfor dialogen.
   - Bruk `max-h-[95dvh] h-[95dvh]` for korrekt høyde på iOS/iPad.
   - Fjern `h-full` fra rad-containeren (linje 3559) — kun `flex-1 min-h-0`.
2. **`BatchLogPanel.tsx`:**
   - Erstatt Radix `ScrollArea` med en vanlig `div className="flex-1 min-h-0 overflow-y-auto overscroll-contain"` (med `-webkit-overflow-scrolling: touch` via eksisterende mønster) — samme enkle, pålitelige scroll-løsning vi brukte i avslutt-flytur-dialogen.
   - «Lagre alle»-footeren forblir `shrink-0` og alltid synlig nederst; kun logglisten skroller.
3. Tilsvarende sjekk av single-logg-splitvisningen (linje 3756) — samme `ScrollArea` byttes der hvis den deler samme svakhet.

## Verifisering
- Typecheck/build grønn.
- Manuell gjennomgang av klassekjeden; live-test i preview er begrenset pga. ekstern autentisering — be bruker verifisere med mange valgte logger (10+).

## Omfang
Kun presentasjon/layout i de to filene over. Ingen endring i dataflyt, RLS eller importlogikk.
