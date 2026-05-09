## Bakgrunn

Dagens «Opprett oppdrag»-guide prøver å gå gjennom oppdrags-popupen (`MissionDialog`). Driver.js får ikke tak i elementene fordi dialogen ikke er åpen, og selv om den åpnes så er trinnene knyttet til en lang skjema-popup som ikke reflekterer hvordan AviSafe anbefaler å jobbe.

Best practice i AviSafe er:
1. Gå til **Kart** → klikk **«Planlegg ny rute»**
2. Tegn ruten i kartet
3. Skru på **SORA volum** og juster buffer/drone i SORA-panelet
4. (Valgfritt) Skru på **Tilstøtende** for befolkningstetthet
5. Klikk **Lagre rute** — dette åpner oppdragsdialogen forhåndsutfylt med rute, buffer og SORA-data

## Endring

Skriv om `missionCreationTour` slik at den følger kart-flyten i stedet for popup-flyten. Behold tour-infrastrukturen (driver.js, GuidedTourProvider, StartTourButton) uendret.

### Ny stegrekkefølge (alle på `/kart`)

1. **Start på kartet** — beskrivelse av hvorfor kart + ruteplanlegger er anbefalt arbeidsflyt. Highlight: kart-container.
2. **Planlegg ny rute** — highlight «Route»-knappen i kartkontrollene (`map-route-planner-trigger`).
3. **Tegn ruten** — instruks om å klikke i kartet for å legge punkter. Highlight: kartet (informativ; ingen klikkavhengighet).
4. **SORA volum** — highlight bryteren i ruteplanleggerens header (`map-sora-toggle`). Forklarer buffer-volum og at drone/hastighet/høyde fylles inn her.
5. **SORA-innstillinger** — highlight SORA-panelet (`map-sora-panel`) når det er åpent. `optional: true` for å hoppes over hvis lukket.
6. **Tilstøtende områder** — highlight Tilstøtende-bryteren (`map-adjacent-toggle`). Forklarer befolkningstetthet/SAIL.
7. **Pilotposisjon (valgfritt)** — highlight pilot-knappen (`map-pilot-button`).
8. **Lagre rute** — highlight Lagre-knappen (`map-route-save`). Forklarer at lagring åpner oppdragsdialogen med all data forhåndsutfylt.
9. **Oppdragsdialog** — kort tekstlig steg som forklarer at brukeren nå fyller inn navn, kunde, dato, personell, sjekklister osv. Ingen highlight (target = body, `optional: true`) — vi prøver ikke lenger å drive gjennom selve dialog-skjemaet.
10. **Avslutt** — guide ferdig, peker på hjelp-knappen og Min profil → Kompetanse for å starte på nytt.

### Filer som skal endres

- `src/tours/missionCreationTour.ts` — full omskriving til ny stegrekkefølge.
- `src/components/OpenAIPMap.tsx` — legg `data-tour="map-route-planner-trigger"` på «Planlegg ny rute»-knappen (linje ~1205).
- `src/pages/Kart.tsx` — legg til:
  - `data-tour="map-sora-toggle"` på SORA-volum-knappen (~linje 847)
  - `data-tour="map-adjacent-toggle"` på Tilstøtende-knappen (~linje 869)
  - `data-tour="map-route-save"` på begge Lagre-knappene (mobil ~672, desktop ~830)
  - `data-tour="map-pilot-button"` på pilot-knappen (~linje 783)
  - `data-tour="map-container"` på den ytre wrapperen til kartet (eller bruk `.leaflet-container` som selector — vi velger en stabil eksisterende klasse).

### Det vi ikke endrer

- Tour-infrastruktur (`GuidedTourProvider`, `useGuidedTour`, `tourUtils`, `tourDefinitions`, `StartTourButton`).
- Systemoversikt-guiden.
- `mission-create-button` data-attributtet i `OppdragFilterBar` beholdes (brukes ikke lenger i mission-creation-touren, men er ufarlig og kan brukes senere).
- Ingen forretningslogikk endres — kun data-tour-attributter og ny stegtekst.

### Robusthet

- Alle steg får `optional: true` slik at de hoppes over hvis brukeren f.eks. ikke har åpnet ruteplanleggeren ennå.
- Steg 4–7 forutsetter at ruteplanleggeren er aktiv; hvis ikke, hoppes de gracefully over (eksisterende `waitForElement` med kort timeout).
- Vi vurderer å legge til en `beforeStep` på SORA-stegene som auto-åpner SORA-panelet ved å klikke `[data-tour="map-sora-toggle"]` hvis det er lukket — kun hvis det ikke skaper sideeffekter. Beslutning tas i implementasjon ut fra hvordan toggle-state oppfører seg.
