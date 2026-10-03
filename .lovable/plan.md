# Fiks frys og skjulte knapper i Safari på iPhone/iPad

## Mål
1. Appen skal ikke fryse når «Ny versjon tilgjengelig» dukker opp mens et vindu (f.eks. oppdragsredigering) er åpent.
2. Knapper øverst og nederst skal aldri havne bak statuslinjen, hjem-streken eller tastaturet.

## Endringer

### 1. Oppdateringsvarselet
- Ikke vis varselet mens et vindu/skjema er åpent. Det venter til vinduet lukkes, og vises da.
- «Tving umiddelbart» venter også til vinduet er lukket (maks ca. 2 min), slik at ingen mister ulagrede endringer.
- Varselet legges nederst på skjermen i stedet for øverst, utenfor feltet der vinduenes lukkeknapper ligger. Høyden tilpasses hjem-streken.
- Varselet kan lukkes («Senere»).

### 2. Låste knapper etter at et vindu lukkes
- Sikkerhetsnett: når siste vindu lukkes, fjernes eventuelle rester av «sperret siden»-tilstand som Safari av og til ikke rydder bort. Dette er den vanligste årsaken til at alle knapper slutter å virke til appen startes på nytt.
- Samme opprydding når appen kommer tilbake fra bakgrunnen.

### 3. Knapper utenfor skjermen
- Oppdragsvinduet (nytt/rediger oppdrag): fast topp med lukkeknapp og fast bunn med «Avbryt»/«Lagre». Kun innholdet i midten ruller.
- Topp og bunn får avstand til statuslinje og hjem-strek.
- Når tastaturet er oppe, krymper vinduet til synlig område så «Lagre» og feltet du skriver i alltid kan nås.
- Samme høyderegel legges på felles vinduskomponent slik at andre vinduer også holder seg innenfor skjermen.

## Tekniske detaljer
- `useForceReload.ts`: utsett `showBanner`/`performReload` mens `document.querySelector('[role="dialog"][data-state="open"]')` finnes; sjekk ved lukking via MutationObserver og `visibilitychange`.
- `ForceReloadBanner.tsx`: `bottom-0`, `paddingBottom: calc(env(safe-area-inset-bottom) + .75rem)`, «Senere»-knapp; tekster via `t()` i no.json/en.json.
- Ny `useBodyLockRecovery` (montert i App): når ingen åpne dialoger, fjern `pointer-events:none` og `overflow:hidden` på `body`/`html` og `data-scroll-locked`.
- `dialog.tsx`: `max-h-[90vh] max-h-[90dvh]` (vh-fallback for DJI), maks høyde ut fra `visualViewport` når tastatur er oppe, safe-area padding.
- `AddMissionDialog.tsx`: flex-kolonne med sticky header/footer, midtdel `overflow-y-auto [touch-action:pan-y]`.
- Ingen databaseendringer. Validering: typesjekk + test i iPhone-størrelse i forhåndsvisning; endelig bekreftelse må gjøres på iPad/iPhone hos kunden.
