## Problem

I `resourcesTour` brukes `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))` til å lukke åpne dialoger mellom steg. Driver.js (tour-biblioteket) lytter også på Escape og kaller `onDestroyStarted` → tour-instansen ødelegges, men body kan henge igjen i en tilstand der ny dialog er åpnet uten tour-popover. Det er derfor «Legg til kompetanse»-steget får touren til å forsvinne — på det steget kalles `closeAnyOpenDialog` for å lukke person-dialogen, og Escape dreper hele touren.

Samme bug treffer i prinsippet alle steg som kaller `closeAnyOpenDialog` mens en dialog er åpen, men den slår tydeligst ut her fordi det er det første steget hvor en stor dialog faktisk var åpen rett før neste-steget.

## Løsning

Slutte å bruke Escape i tour-flyten. I stedet styre dialog-lukking via React-state gjennom `__avisafeResourcesTour`-broen.

### Endringer

1. **`src/pages/Resources.tsx` — utvid broen**
   - Behold `closeAll` (lukker alt via state-settere).
   - Erstatt Escape-baserte `closeDroneLogbook` og `closeEquipmentLogbook` med tilsvarende state-settere. Loggbok-dialogene er sub-dialoger eid av henholdsvis `DroneDetailDialog` / `EquipmentDetailDialog`. To alternativer:
     - a) Løft logbok-open-state opp til `Resources.tsx` og send som prop, slik at vi kan kalle setter direkte fra broen.
     - b) Eksponer en imperativ ref/callback fra detalj-dialogene som broen kaller.
   - Velger (a): minst invasiv, gir broen full kontroll, og samsvarer med hvordan `openDroneLogbook` allerede kalles via DOM-knapp.

2. **`src/tours/resourcesTour.ts` — fjern alle Escape-dispatch**
   - `closeAnyOpenDialog` skal kun kalle `bridge().closeAll()` og vente kort.
   - `closeDroneLogbook` / `closeEquipmentLogbook` skal kalle de nye state-baserte broen-funksjonene i stedet for Escape.

3. **Robusthet i `GuidedTourProvider.tsx` (defensiv ekstra-fix)**
   - I `onDestroyStarted`: sjekk om nedstegningen kommer fra Escape ved å ignorere destroy-kallet hvis `document.body.classList.contains("avisafe-tour-active")` og siste keydown var Escape innen kort tid. Dette beskytter mot framtidige tour-utviklere som ved et uhell igjen sender Escape.
   - Konkret: legg til `keydown`-listener (capture, mens touren kjører) som kaller `event.stopPropagation()` på Escape — slik at user fortsatt kan lukke touren via «X»-knappen, men ikke uforvarende via Escape. Brukeren kan fortsatt avbryte via «Hopp over» / overlay-klikk.

### Resultat

- «Legg til kompetanse»-steget åpner riktig dialog uten å rive ned touren.
- Alle andre steg som måtte lukke en åpen dialog gjør det via state, ikke Escape.
- Tilbakefall i framtidige tourer blokkeres av provider-defensiven.

## Spørsmål før implementering

Ingen — fortsetter rett på fiks når du godkjenner.
