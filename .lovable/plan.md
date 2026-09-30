# Rulling i flylogger på DJI RC Pro

## Mål
Flylogg-oversikten, flyanalyse-vinduet og opplastings-/importvinduet skal kunne rulles med fingeren på DJI RC Pro, på samme måte som ressurssiden. Ingen endring i utseende eller oppførsel på PC, iPad eller mobil.

## Hva som er annerledes i dag
- Ressurssiden bruker enkle rullefelt (vanlig `overflow-y-auto`) uten spesielle berøringsregler og uten kart inne i listene.
- Flylogg-oversikten har et lite Leaflet-kart i hvert kort. Kartet er satt til å ignorere berøring, men selve flyruta (linja) er fortsatt «interaktiv» i Leaflet, og Leaflets egne stiler kan fange opp fingerbevegelsen i den gamle nettleseren på kontrolleren. Når man starter å dra på et kartbilde, ruller ikke siden.
- Flyanalyse-vinduet og opplastingsvinduet har rullefelt uten eksplisitt berøringsrulling (`touch-action: pan-y` / momentum), og enkelte underlister mangler `overscroll-contain`, slik at bevegelsen havner på vinduet bak (som er låst).

## Endringer
1. Felles rulleregel: en liten CSS-klasse (f.eks. `dji-scroll`) i `src/index.css` som gir `overflow-y: auto`, `touch-action: pan-y`, `-webkit-overflow-scrolling: touch` og `overscroll-behavior: contain` — samme oppsett som allerede fungerer i nedtrekksmenyene og ressurs-loggbøkene.
2. Flylogg-oversikten (`FlightLogCard.tsx`):
   - Kartlinja lages som ikke-interaktiv (`interactive: false`) og kartbeholderen får `touch-action: pan-y` så Leaflet aldri fanger fingeren.
   - Kortet beholder klikk for å åpne analysen; `touch-pan-y` beholdes.
3. Flyanalyse-vinduet (`FlightAnalysisDialog.tsx`): hovedrullefeltet får `dji-scroll`. Eventuelle kart/grafer inne i vinduet påvirkes ikke utover selve rullefeltet.
4. Last opp/importer logg (`UploadDroneLogDialog.tsx`, `PendingDjiLogsSection.tsx`): alle rullefelt (vinduet i enkel visning, venstre kolonne i delt visning, ventende DJI-logger, batch-lista og treff-lista) får `dji-scroll`.

## Tekniske detaljer
- Dialoger kjører allerede ikke-modalt på DJI (`isDjiController` i `ui/dialog.tsx`), så scroll-låsen er ikke årsaken; problemet er berøringsregler i selve rullefeltene og kartene.
- Ingen database-, tekst- eller logikkendringer; ingen nye i18n-nøkler.
- Regelen i `AGENTS.md` oppdateres: rullefelt som skal brukes på DJI-kontrolleren bruker `dji-scroll`, og statiske Leaflet-miniatyrer lages ikke-interaktive.

## Verifisering
Build og typesjekk. Kontrolleren kan ikke testes herfra, så endelig bekreftelse må gjøres på RC Pro: rull i flylogg-oversikten (også ved å starte på et kartbilde), i flyanalysen og i opplastingsvinduet.
