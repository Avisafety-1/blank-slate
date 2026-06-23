## Problem

I dialogen som vises rett etter at en ArduPilot-logg er parset (før lagring), vises mye nyttig info: Flytid, Maks hastighet, Min. batteri, Datapunkter, Distanse, Maks høyde, GPS sat., Batt. temp, Min. spenning, Maks avstand, Maks V-fart, RTH-banner og en liste over hendelser (mode_change, arm/disarm, LAND_COMPLETE, APP_WARNING osv.).

Etter at oppdraget er lagret og man åpner «Flyanalyse» fra oppdragskortet (eller fra drone-loggbok / mission detail), vises kun kart + tidslinje. Sammendragstallene og hendelsene mangler — selv om dataen finnes i Supabase.

## Hva som faktisk er lagret i Supabase i dag

- `flight_logs`-kolonner: `max_horiz_speed_ms`, `max_vert_speed_ms`, `max_height_m`, `max_distance_m`, `total_distance_m`, `battery_voltage_min_v`, `battery_temp_max_c`, `battery_cell_deviation_max_v`, `gps_sat_min`, `gps_sat_max`, `rth_triggered`, `dronelog_warnings`, `flight_duration_minutes`, `start_time_utc`, `end_time_utc`, `aircraft_serial`, `drone_model` osv. — alle settes allerede av `buildExtendedFields` ved import.
- `flight_events`-tabellen: alle hendelser (mode_change, arm, disarm, error, message, event) lagres allerede av `saveFlightEvents` med `t_offset_ms`, `type`, `message`.
- `flight_track` (JSONB på `flight_logs`): inneholder kun `{ positions: [...] }`.

Konklusjon: **ingen ny dataparsing trengs, og ingen DB-endring.** Dette er ren frontend — vi henter feltene som allerede er der og viser dem i `FlightAnalysisDialog`.

## Endringer

### 1. `FlightAnalysisDialog` (`src/components/dashboard/FlightAnalysisDialog.tsx`)

Utvid `flightTrack`-propet med et valgfritt `summary`-objekt og `events`-array (events er allerede støttet, men brukes ikke av kallere — se under). Render et nytt sammendragspanel øverst i dialogen (mellom DialogHeader og kartet) som matcher oppsettet i upload-previewen:

- Grid med kort: Flytid, Maks hastighet, Min. batteri (% eller V), Datapunkter, Distanse, Maks høyde, GPS sat., Batt. temp, Min. spenning, Maks avstand, Maks V-fart.
- RTH-advarselsbanner når `summary.rth_triggered === true`.
- «Hendelser under flyging»-seksjon under sammendraget med samme grupperings-/telle-logikk som upload-previewen (kollapser like meldinger med `×N`, kollapsbar APP_WARNING-gruppe).

Skjul kort som har null/undefined-verdi for å unngå tomme bokser når data mangler (eldre logger eller DJI-import uten samme felt).

### 2. Kallere som åpner Flyanalysen

Tre steder konstruerer `analysisTrack` fra `log.flight_track` (kun positions). Endre disse til å bygge et utvidet objekt `{ positions, events, summary }`:

- `src/components/oppdrag/MissionCard.tsx` (linje ~801)
- `src/components/dashboard/MissionDetailDialog.tsx` (linje ~393)
- `src/components/resources/DroneLogbookDialog.tsx` (linje ~739)

For hver klikk:
1. `events`: hent fra `flight_events`-tabellen via `supabase.from('flight_events').select('*').eq('flight_log_id', log.id).order('t_offset_ms')`. Cache per logg-id i lokal state for å unngå reload ved gjenåpning.
2. `summary`: bygg fra felt som allerede ligger på `log`-objektet (max_horiz_speed_ms, battery_voltage_min_v, battery_temp_max_c, gps_sat_min/max, max_distance_m, max_vert_speed_ms, max_height_m, total_distance_m, flight_duration_minutes, rth_triggered, dronelog_warnings).

Hvis `log`-objektet i `useOppdragData`/MissionDetailDialog/DroneLogbookDialog ikke allerede selecter disse kolonnene, utvid SELECT-listen til å ta dem med (alle kolonnene finnes allerede på `flight_logs`).

### 3. Ingen backend-endringer

- Ingen migrering.
- Ingen edge-function-endring.
- Ingen endring i ardupilot-normalizer.

## Teknisk oppsummering

```text
UploadDroneLogDialog (preview)                FlightAnalysisDialog (etter lagring)
┌─ Sammendragskort  ✅                        ┌─ Sammendragskort  ❌ → ✅ (ny)
├─ RTH-banner      ✅                        ├─ RTH-banner      ❌ → ✅ (ny)
├─ Hendelsesliste  ✅                        ├─ Hendelsesliste  ❌ → ✅ (ny)
├─ Kart            ✅                        ├─ Kart            ✅
└─                                            └─ Tidslinje      ✅
```

Datastien blir:
```text
flight_logs (kolonner)  ──► summary ──┐
flight_events (rader)   ──► events  ──┼──► FlightAnalysisDialog.flightTrack
flight_track.positions  ──► positions ┘
```
