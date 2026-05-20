# Detaljert flylogg-rapport i PDF-eksport

## Mål
På `/oppdrag` → "Eksporter PDF" skal man, når oppdraget har én eller flere `flight_logs`, kunne huke av en ny seksjon **"Detaljert flylogg-rapport"** som legger til en utvidet del per flytur i PDF-en.

## Endringer

### 1. `src/lib/oppdragPdfExport.ts`
- Utvid `DEFAULT_PDF_SECTIONS` med `flightLogsDetailed: false` (av som standard for å unngå svære PDF-er; brukeren skrur den på).
- Etter eksisterende "Flyturer"-tabell (linje 770–838): hvis `sections.flightLogsDetailed && mission.flightLogs?.length > 0`, render én blokk per flylogg med:
  - **Sammendrag-tabell**: dato/tid, varighet, pilot, drone + serienummer, kilde (DJI/ArduPilot/Manuell), avgangs-/landingssted, total distanse, maks høyde, maks horisontal/vertikal hastighet, maks avstand, RTH utløst.
  - **Batteri**: SN, syklus, helse %, full kapasitet, min spenning, maks celle-avvik, min/max temp.
  - **GPS**: min/max satellitter.
  - **App-advarsler** (`dronelog_warnings`): liten tabell med tidspunkt + melding (begrenset til f.eks. 50 stk, med "+X flere" hvis trunkert).
  - **Høyde-/hastighetsgraf** generert fra `flight_track.positions` via jsPDF (enkel linjegraf rendret som vektor: x = tid, y = høyde og en sekundær linje for fart). Plottes på canvas/SVG-lik måte direkte i PDF med `pdf.line()`.
  - **Koordinater fra faktisk fløyet rute**: nedsamplet til maks ~50 punkter (jevnt fordelt fra `flight_track.positions`) — tabell med tid, lat, lon, høyde.
- Hver flylogg starter på ny side hvis nødvendig (`pdf.addPage()` ved lite plass).

### 2. `src/hooks/useOppdragData.ts`
- Utvid `flight_logs`-SELECT (linje 164 og 299) til også å hente feltene som trengs: `dronelog_warnings, start_time_utc, end_time_utc, total_distance_m, max_height_m, max_horiz_speed_ms, max_vert_speed_ms, max_distance_m, rth_triggered, battery_sn, battery_health_pct, battery_full_capacity_mah, battery_voltage_min_v, battery_cell_deviation_max_v, battery_temp_min_c, battery_temp_max_c, battery_cycles, gps_sat_min, gps_sat_max, drone_model, aircraft_serial, source, departure_location, landing_location, notes`.

### 3. `src/components/oppdrag/dialogs/OppdragDialogs.tsx`
- Under den eksisterende "Flyturer"-checkboxen (linje 441–445), legg til en avhengig under-checkbox **"Detaljert flylogg-rapport (grafer, advarsler, koordinater)"** som bare er synlig/aktiv når `pdfSections.flightLogs` er på og `flightLogs.length > 0`.
- Inkluder `flightLogsDetailed` i "Velg alle/Fjern alle"-logikken (`visibleKeys`) når relevant.

## Tekniske detaljer
- Grafen tegnes med `pdf.setDrawColor` + `pdf.line()` mellom punkter; akse-labels med `pdf.text`. Ingen ny avhengighet.
- `flight_track.positions` antas å være `[{ t, lat, lon, alt, speed? }]`. Hvis felter mangler, skipp grafen for den loggen.
- Nedsampling: ta `Math.floor(positions.length / N)`-steg så vi får ~50 koordinater og ~200 graf-punkter.
- App-advarsler: vi viser `severity`, `code`/`message`, `timestamp` hvis tilgjengelig (følger eksisterende DJI-parser-skjema).

## Ikke i scope
- Endringer i hvordan flyloggene parses/lagres.
- Eksport av rådata-CSV.
