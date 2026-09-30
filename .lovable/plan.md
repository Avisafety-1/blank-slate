# Rulling i behandling av flylogger på DJI RC Pro

## Mål
Vinduet der man behandler flylogger og oppretter oppdrag fra dem — både enkeltvis (flylogg-detaljer) og i batch — skal kunne rulles på DJI RC Pro, på samme måte som ressurssiden. Ingen endring på PC, iPad eller mobil.

## Forskjellen mot ressursene
Ressursvinduene (drone-/utstyrsdetaljer, loggbøker, lister fra dashbordet) setter høyden to ganger: først i `vh`, så i `dvh` (f.eks. `max-h-[90vh] max-h-[90dvh]`), og rullefeltet har `touch-action: pan-y` og iOS-/WebView-momentum. Kontrolleren (Chromium 70) forstår ikke `dvh`, så den bruker `vh`-verdien.

Flyloggvinduet (enkelt- og batchbehandling) bruker bare `h-[95dvh]` / `max-h-[95dvh]` / `max-h-[90dvh]`, uten `vh`. På kontrolleren blir høyden derfor ignorert: vinduet får ingen fast høyde, rullefeltene inni får aldri en grense å rulle innenfor, og innholdet kuttes bare av. Venstre kolonne og flylogg-detaljene mangler i tillegg `touch-action: pan-y`.

## Endringer (samme mønster som ressursene)
1. `src/components/UploadDroneLogDialog.tsx`: legg til `vh`-fallback foran hver `dvh`-verdi på vinduet — `h-[95vh] h-[95dvh] max-h-[95vh] max-h-[95dvh]` i delt visning og `max-h-[90vh] max-h-[90dvh]` i enkel visning — og `[touch-action:pan-y] [-webkit-overflow-scrolling:touch]` i enkel visning.
2. Rullefeltene i delt visning (venstre kolonne, flylogg-detaljer, treff-/utstyrslister) får `[touch-action:pan-y] [-webkit-overflow-scrolling:touch] overscroll-contain`.
3. `src/components/upload/BatchLogPanel.tsx`: batch-lista får `[touch-action:pan-y]` i tillegg til dagens rullefelt.
4. Andre `dvh`-verdier i flyloggflyten (`LogFlightTimeDialog.tsx`) får samme `vh`-fallback.

## Tekniske detaljer
- Dialoger kjører allerede ikke-modalt på DJI (`isDjiController` i `ui/dialog.tsx`), så scroll-låsen er ikke årsaken.
- Ingen database-, tekst- eller logikkendringer.
- `AGENTS.md` får regelen: bruk aldri `dvh` uten `vh`-fallback, fordi DJI-kontrollerens Chromium 70 ikke støtter det.

## Verifisering
Build og typesjekk, og kontroll i nettleser med en vanlig skjerm. Selve kontrolleren kan ikke testes herfra, så endelig bekreftelse må gjøres på RC Pro: åpne en ventende logg (enkelt) og velg flere (batch), og rull i begge panelene.
