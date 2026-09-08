# Ny KPI: importerte flyturer som ikke var planlagt

## Problemet med enkel måling

Å telle logger uten oppdragskobling fungerer ikke, fordi det som regel opprettes et nytt oppdrag når loggen behandles. Loggen får da en kobling, selv om flyturen aldri var planlagt på forhånd.

## Bedre måling

En flytur regnes som **ikke planlagt** når én av disse stemmer:

1. Loggen har ingen oppdragskobling i det hele tatt, eller
2. Oppdraget den er koblet til ble **opprettet etter at flyturen startet** (med litt slingringsmonn, standard 15 minutter) — altså et oppdrag laget i etterkant for å dokumentere turen.

Kontroll mot dagens data: av 1 195 importerte logger har bare 16 ingen oppdragskobling, mens 797 er koblet til et oppdrag som ble opprettet etter at flyturen startet. Det bekrefter at målet må bygge på tidspunktet oppdraget ble opprettet.

Gjelder kun logger importert automatisk fra DJI eller ArduPilot.

## Hva som vises på /status

Ny KPI-boks:
- Stort tall: antall ikke-planlagte importerte flyturer i valgt periode
- Undertekst: andel av alle importerte flyturer i perioden, f.eks. "797 av 1 195 (67 %)"
- Fargesignal: grønn ved lav andel, gul/rød når andelen stiger
- Klikk åpner flyloggene med dette filteret, slik at man kan gå gjennom dem

Under KPI-kortene: en månedsgraf med planlagt vs. ikke planlagt, så trenden er synlig.

For å unngå misforståelse får boksen en liten forklaringstekst: "Flyturer der oppdraget først ble opprettet etter at flyturen startet, eller helt uten oppdrag."

Ingen databaseendringer er nødvendig.

## Varsling (senere)

Ikke med nå, men regelen legges i én gjenbrukbar funksjon slik at en senere varslingsjobb (f.eks. ukentlig e-post når andelen overstiger en grense) bruker nøyaktig samme definisjon.

## Teknisk

- Ny fil `src/lib/unplannedFlights.ts`: `isUnplannedFlight(log, mission, toleranceMinutes = 15)` og `summarizeUnplanned(logs)` som returnerer `{ total, unplanned, pct, byMonth }`. Kilde-filter: `source in ('dronelogapi','ardupilot')`.
- `src/pages/Status.tsx`: i `fetchKPIData`, hent `flight_logs` i perioden med `select("id, flight_date, start_time_utc, source, mission_id, missions(opprettet_dato)")` og kjør `summarizeUnplanned`. Utvid `KPIData` med `importedFlights` og `unplannedFlights`. Nytt `GlassCard` i KPI-rutenettet (5 kort, beholder `lg:grid-cols-4` med wrap) + ny state `unplannedByMonth` rendret som stablet Recharts-graf ved siden av eksisterende månedsgrafer.
- Klikk navigerer til flyloggvisningen med `?unplanned=1`; `FlightLogsView` leser paramet og filtrerer med samme hjelpefunksjon.
- Excel/PDF-eksport i `Status.tsx`: legg KPI-en inn i KPI-arket og KPI-tabellen.
- i18n: nye nøkler under `status.metrics.*` i både `no.json` og `en.json`.
