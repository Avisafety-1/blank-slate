## Svar på spørsmålet om eksisterende varsling

Ja — vi har allerede konfliktvarsling for overlappende planlagte oppdrag, men kun ved **planlegging/redigering** av oppdrag (ikke som visuell markering på Kart-siden):

- `src/hooks/useMissionMapConflicts.ts` kaller RPC `check_planned_mission_conflicts` (geometri + tidsvindu).
- Den brukes i oppdragsdialogen og viser en advarsel hvis ditt nye/redigerte oppdrag overlapper et annet planlagt oppdrag i tid og rom.
- I tillegg finnes `useResourceConflicts` (overlap/same_day på drone, utstyr, personell) som varsler ved ressurskonflikt.

Det vi **ikke** har i dag, er visuell markering av overlappende geografiske områder på selve kartet (`/kart`). Alle planlagte oppdrag tegnes nå med samme blå farge (`#2563eb`, `fillOpacity 0.15`, stiplet) — så når to polygoner overlapper, blir overlappet bare litt mørkere blått pga. additiv opacity. Det er ikke tydelig.

## Plan: visualiser overlapp på Kart

### Hva som endres
Kun frontend, kun rendring i `fetchAndDisplayPlannedMissionPublications` (`src/lib/mapDataFetchers.ts`). Ingen endring i database, RPC eller datavisning.

### Tilnærming
Etter at alle planlagte polygoner er hentet og før de tegnes:

1. Samle alle polygon-geometrier (`Polygon` / `MultiPolygon`) i en liste.
2. Bruk eksisterende `polygon-clipping`-biblioteket (allerede i `package.json`) til å beregne parvise snitt (`intersection`) mellom hver kombinasjon av oppdrag.
3. Slå sammen alle snitt-polygoner til ett `MultiPolygon` ("overlap-laget").
4. Tegn alle oppdragspolygoner som i dag (blå, stiplet, lett fyll).
5. Tegn overlap-laget oppå med tydelig advarselsfarge:
   - `color: hsl(var(--destructive))` ekvivalent — rød/oransje (f.eks. `#dc2626`)
   - `fillColor` lik, `fillOpacity: 0.35`
   - `weight: 1.5`, ingen stipling
   - Eget pane over `missionPane` slik at det alltid ligger øverst og ikke fanger opp klikk (slik at popups på underliggende oppdrag fortsatt fungerer) — `interactive: false`.
6. Legg til en kort tooltip på overlap-laget: "Overlappende planlagte områder — sjekk konflikter".

### Tekniske detaljer
- `polygon-clipping` jobber med ringer som `[[lng,lat], ...]`. Vi konverterer hver GeoJSON-`Polygon`/`MultiPolygon` til formatet biblioteket forventer, kjører `intersection(a, b)` for alle par, og samler ikke-tomme resultater.
- For ytelse: hopp over par hvis bounding box ikke overlapper (rask filter med Leaflets `LatLngBounds`).
- Tids-overlapp: vi tegner kun overlap når oppdragene også overlapper i tid. Siden spørringen allerede filtrerer på `[now, now+windowHours]`, bruker vi `starts_at`/`ends_at` per rad og sjekker `aStart < bEnd && bStart < aEnd` før vi tar geometrisk snitt.
- Overlap-laget legges i samme `layer: L.LayerGroup` som sendes inn, slik at det ryddes sammen med resten ved neste kall.

### Hva som IKKE endres
- Ingen ny RPC eller DB-migrasjon.
- Eksisterende konfliktvarsling i oppdragsdialogen (`useMissionMapConflicts`) beholdes som den er.
- Ingen endringer på live-droner eller andre lag.

### Filer som berøres
- `src/lib/mapDataFetchers.ts` — utvide `fetchAndDisplayPlannedMissionPublications` med beregning og rendring av overlap-polygoner.
