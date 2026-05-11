## Problem

Når brukeren trykker **Fullfør** på siste steg i en guided tour, lukkes popoveren — men siden blir uklikkbar. Dialogen forsvinner visuelt, men driver.js etterlater elementer/klasser som blokkerer all interaksjon.

## Årsak

`GuidedTourProvider.tsx` har allerede en `cleanupTourUi()` som fjerner et utvalg driver.js-noder, men den dekker ikke alt driver.js v1 legger igjen ved en "synkron" destroy fra knappen `Fullfør`:

- driver.js setter `class="driver-active driver-fade"` på `<html>` og `<body>` — disse fjernes ikke. Mens `driver-active` er aktiv settes `overflow:hidden` og enkelte pointer-events-regler internt i driver.js.
- SVG-overlayet kan hete `.driver-overlay` *eller* være et wrapper-element `#driver-page-overlay` / `.driver-overlay-container` som ikke matches av selectoren i dag.
- `.driver-highlighted-element` (en annen klasse enn `.driver-active-element`) blir noen ganger hengende.
- Når `onNextClick` på siste steg kjører `d.destroy()` synkront, skjer cleanup før driver.js har rukket å fjerne sine egne lyttere, så `pointer-events: none` på body kan bli satt *etter* vår opprydding.

## Løsning

Gjør én målrettet endring i `src/components/guided-tour/GuidedTourProvider.tsx`:

1. **Utvid `cleanupTourUi()`** til å:
   - Fjerne *alle* elementer som matcher `[class*="driver-"]` på top-nivå (overlay, stage, popover, container, page-overlay, highlighted-element-wrapper).
   - Fjerne klassene `driver-active`, `driver-fade`, `driver-active-element`, `driver-highlighted-element` fra både `<html>` og `<body>` og fra eventuelle gjenværende elementer.
   - Nullstille inline `pointer-events`, `overflow` og `position` på `<html>` og `<body>` (driver.js setter disse).
   - Fjerne attributtet `data-tour-id` (allerede gjort) samt `data-driver-*`-attributter.

2. **Kjør cleanup i flere passeringer** etter at tour fullføres, ikke bare to:
   - `cleanupTourUi()` umiddelbart, så via `requestAnimationFrame`, så `setTimeout(…, 100)`. Det fanger driver.js' egne post-destroy-effekter som kjøres asynkront.

3. **Forhindre dobbel-destroy race** ved at `finish()` på siste steg `requestAnimationFrame`-er destroy-kallet, slik at driver.js får fullført sin egen interne tilstandsovergang før vi rydder.

Ingen endringer i tour-definisjoner, CSS eller andre komponenter er nødvendig — kun denne provideren.

## Validering

Etter endringen, manuelt teste én tour helt til **Fullfør**:
- Bekreft at popover/overlay forsvinner.
- Bekreft at man kan klikke menyen, scrolle siden og åpne en dialog umiddelbart.
- Sjekk i devtools at `<html>` og `<body>` ikke har `driver-*` klasser eller inline `pointer-events`/`overflow`.

## Tekniske detaljer

Berørt fil: `src/components/guided-tour/GuidedTourProvider.tsx` — kun `cleanupTourUi()` og siste-steg-grenen i `finish()`. Ingen nye dependencies.