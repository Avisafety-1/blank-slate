# Rulling i behandling av flylogger på DJI RC Pro

## Mål
Vinduet der man behandler flylogger og oppretter oppdrag fra dem — både enkeltvis (flylogg-detaljer) og i batch — skal kunne rulles på DJI RC Pro, på samme måte som ressurssiden. Ingen endring på PC, iPad eller mobil.

## Sannsynlig årsak
Vinduet får høyden sin fra `95dvh` / `90dvh` (enheten «dynamisk skjermhøyde»). Den gamle nettleseren på DJI-kontrolleren (Chromium 70) forstår ikke `dvh`, så høyden ignoreres helt. Da har vinduet ingen fast høyde, rullefeltene inni (venstre liste, flylogg-detaljer og batch-panelet) får aldri noen grense å rulle innenfor, og innholdet blir bare kuttet av (`overflow-hidden`). Ressurssidens vinduer bruker vanlig `vh`, som kontrolleren forstår — derfor fungerer de.

## Endringer
1. `src/index.css`: små hjelpeklasser som setter høyden først i `vh` (fallback) og deretter i `dvh`, f.eks. `.h-dialog-95 { height: 95vh; height: 95dvh }` og tilsvarende `max-height` for 95 % og 90 %. Nye nettlesere bruker `dvh`, kontrolleren bruker `vh`.
2. `src/components/UploadDroneLogDialog.tsx`: bytt `h-[95dvh]`, `max-h-[95dvh]` og `max-h-[90dvh]` på vinduet med de nye klassene (gjelder enkelt- og delt visning).
3. Rullefeltene i delt visning — venstre kolonne, flylogg-detaljer og treff-/utstyrslister — får samme berøringsregler som resten av appen bruker for DJI (`touch-action: pan-y`, `-webkit-overflow-scrolling: touch`, `overscroll-contain`).
4. `src/components/upload/BatchLogPanel.tsx`: batch-lista har allerede riktig rullefelt, men får samme `touch-action: pan-y`, slik at den også ruller når man starter bevegelsen på et kort eller skjemafelt.
5. Søk etter andre `dvh`-verdier i vinduer som brukes i flyloggflyten og gi dem samme fallback.

## Tekniske detaljer
- Dialoger kjører allerede ikke-modalt på DJI (`isDjiController` i `ui/dialog.tsx`), så scroll-låsen er ikke årsaken.
- Ingen database-, tekst- eller logikkendringer.
- `AGENTS.md` får regelen: bruk aldri `dvh` uten `vh`-fallback, fordi DJI-kontrollerens Chromium 70 ikke støtter det.

## Verifisering
Build og typesjekk, og kontroll i nettleser med en vanlig skjerm. Selve kontrolleren kan ikke testes herfra, så endelig bekreftelse må gjøres på RC Pro: åpne en ventende logg (enkelt) og velg flere (batch), og rull i begge panelene.
