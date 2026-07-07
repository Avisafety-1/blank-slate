## Problem

Når man klikker på kartforhåndsvisningen i et oppdragskort, navigeres man til `/kart?missionId=...`. `Kart.tsx` henter da bare `missions.route` (planlagt rute) og sentrerer kartet. Flydde ruter fra tilknyttede `flight_logs.flight_track` vises ikke, selv om de vises fint i `MissionMapPreview` inne på selve oppdragskortet.

## Løsning

Utvide `missionId`-lasteren i `Kart.tsx` til også å hente `flight_logs.flight_track` for oppdraget, og rendre disse som grønne polylines i `OpenAIPMap` — samme visuelle stil som brukes i `MissionMapPreview` (grønt spor, grønn start-, oransje sluttmarkør, popup med høyde/hastighet).

### Endringer

1. **`src/pages/Kart.tsx`**
   - I `useEffect`-en som håndterer `?missionId=...`, gjør en parallell henting:
     ```ts
     supabase.from("flight_logs")
       .select("id, flight_date, flight_track")
       .eq("mission_id", mid)
     ```
   - Filtrer ut logger uten `flight_track.positions`, lagre i ny state `missionFlightTracks: FlightTrack[] | null`.
   - Nullstill state når man forlater visningen (samme sted som `handledMissionParamRef` ryddes / ved cancel).
   - Hvis oppdraget ikke har lagret rute, men har fly-track: bruk første/sentroide fra flysporet som `pendingInitialCenter` i stedet for bare `lokasjon`, så kartet zoomer riktig.

2. **`src/components/OpenAIPMap.tsx`**
   - Legg til ny valgfri prop `historicalFlightTracks?: FlightTrack[] | null`.
   - Ved endringer i prop-en: tegn hvert spor på et dedikert `historicalFlightsPane` (z-index rett under `flightTrackPane` som brukes for live-fly, ~695) inne i en `L.layerGroup` som ryddes ved re-render/unmount.
   - Stil: grønn polyline (`#22c55e`, weight 4, opacity 0.9), grønn `circleMarker` for start, oransje for slutt, popup med tidspunkt + `flight_date` — gjenbruk mønsteret fra `MissionMapPreview`. Ikke hent terrenghøyder her (unngår ekstra kall); popup viser MSL/AGL bare hvis feltene finnes på posisjonen.
   - Sporene skal være synlige uavhengig av kart-modus (både `view` og når mission-ruten redigeres via `handleEditMissionRoute`), slik at brukeren ser planlagt (blå stiplet) + flydd (grønn heltrukket) samtidig.
   - Ved første tegning: hvis ingen `initialCenter` er satt fra ruten, `fitBounds` til sporene.

3. **Sende prop-en**
   - I `Kart.tsx` der `<OpenAIPMap ... />` rendres (linje ~1187), send `historicalFlightTracks={missionFlightTracks}`.

### Ikke i scope

- Ingen DB-endringer, ingen nye RPC-er.
- Endrer ikke `MissionMapPreview` (som allerede fungerer).
- Rører ikke live/aktive-flyt-visning eller `focusFlightId`-logikken.

### Verifisering

1. Åpne et fullført oppdrag med minst én flylogg fra `/oppdrag`.
2. Klikk på kartforhåndsvisningen i oppdragskortet.
3. Forvent: `/kart` åpner, sentrert på oppdraget, med både planlagt rute (blå stiplet, hvis lagret) og flydd rute (grønn heltrukket) synlig, samt grønn start- og oransje sluttmarkør.
4. Åpne et oppdrag uten flylogg → oppfører seg som i dag (kun planlagt rute eller lokasjon).
5. Åpne et oppdrag med flylogg men uten planlagt rute → kartet zoomer til flysporet.
