# Ny KPI: importerte flylogger uten oppdrag

## Hva som lages

En ny KPI-boks på `/status` som viser hvor mange flylogger som er importert automatisk (DJI / ArduPilot) i den valgte perioden, men som ikke er knyttet til et oppdrag. Dette forteller hvor mange flyturer som ble gjennomført uten å være planlagt i Avisafe.

Boksen viser:
- Stort tall: antall importerte flylogger uten oppdrag i perioden
- Undertekst: andel i prosent av alle importerte flylogger i perioden (f.eks. "16 av 1195 (1,3 %)")
- Fargesignal: nøytral ved 0, gul ved lav andel, rød når andelen er høy
- Klikk på boksen åpner flyloggsiden filtrert til disse loggene, slik at de kan knyttes til oppdrag i etterkant

I tillegg en liten månedsgraf under KPI-kortene som viser utviklingen (planlagt vs. ikke planlagt), slik at trenden er synlig over perioden.

## Datagrunnlag

Tallene hentes fra flyloggene som allerede finnes:
- Importerte logger = logger med kilde `dronelogapi` (DJI) eller `ardupilot`
- Uten oppdrag = ingen oppdragskobling på loggen
- Perioden følger periodevelgeren som allerede finnes øverst på statussiden

Ingen databaseendringer er nødvendig.

## Varsling (senere)

Varsling tas ikke med nå. Løsningen forberedes ved at beregningen legges i en egen gjenbrukbar funksjon, slik at en senere varslingsjobb (f.eks. ukentlig e-post til admin når antallet overstiger en grense) kan bruke samme regel.

## Teknisk

- `src/pages/Status.tsx`: utvid `KPIData` med `importedFlightLogs`, `importedWithoutMission`; hent i `fetchKPIData` via en spørring mot `flight_logs` filtrert på `flight_date` i perioden og `source in ('dronelogapi','ardupilot')`, tell rader med `mission_id is null`. Nytt `GlassCard` i KPI-rutenettet (rutenettet går fra 4 til 5 kort; behold `lg:grid-cols-4` med wrap).
- Månedsdata: ny state `unplannedByMonth` bygget etter samme mønster som `missionsByMonth`, rendret med eksisterende Recharts-oppsett.
- Klikk navigerer til flyloggvisningen med query-param for filter (`?unlinked=1`); `FlightLogsView` leser paramet og filtrerer på manglende oppdrag + importert kilde.
- Eksport (Excel/PDF) i `Status.tsx`: legg den nye KPI-en inn i KPI-arket/-tabellen.
- i18n: nye nøkler under `status.metrics.*` i både `no.json` og `en.json`.
