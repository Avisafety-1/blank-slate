
# Utvid flyspor med komplett telemetridata og hoydevisning

## Status: Implementert ✅

### Gjennomforte endringer

#### 1. Telemetridata i flight_track (✅)
- `useFlightTimer.ts`: Henter nå alt_msl, alt_agl, speed, heading, vert_speed fra dronetag_positions
- `FlightTrackPosition` interface utvidet i MissionMapPreview og ExpandedMapDialog

#### 2. Interaktiv kartvisning (✅)
- Klikkbare punkter med telemetri-popup (hvert 5. punkt)
- Fargegradient grønn→rød basert på høyde (MSL) i ExpandedMapDialog
- Statistikk-footer med maks høyde og maks hastighet

#### 3. DroneTag-matching via safesky_beacons-tabell (✅)
- `safesky-cron-refresh`: Byttet fra lokal allBeacons-array (20km /v1/uav) til oppslag i safesky_beacons-tabellen (hele Norge via /v1/beacons)
- `safesky-beacons-fetch`: Henter nå beacons også når det finnes aktive flyturer med dronetag_device_id, selv uten aktive kartvisere
