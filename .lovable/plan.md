# DJI Cloud API bridge i mqtt-broker (Fly.io)

## Bekreftelse på de to spørsmålene dine

**1. Oppslagstabell sn → company_id / drone_id: funnet.** Den heter `drones` i hoved-Supabase-prosjektet (AviSafe). Serienummeret ligger i kolonnen `serienummer` (text), og radene har `id` (uuid, = drone_id) og `company_id` (uuid). Oppslag via REST:
`GET {SUPABASE_URL}/rest/v1/drones?serienummer=eq.{sn}&select=id,company_id&limit=1`

**2. Nye Fly-secrets du må sette** (i tillegg til eksisterende `MQTT_USERNAME` / `MQTT_PASSWORD`):
- `SUPABASE_URL` – URL til hoved-AviSafe-prosjektet
- `SUPABASE_SERVICE_ROLE_KEY` – service role key for samme prosjekt
- `MQTT_BRIDGE_HOST` (valgfri, default `mqtt-broker-avisafe.internal`)

## Viktig funn før koding: tabellen tillater ikke null company_id

`flighthub2_positions` har `company_id`, `order_id`, `flight_status`, `time_stamp`, `lat`, `lng` som **NOT NULL**. Å skrive raden med `company_id = null` når serienummeret ikke finnes i `drones` er derfor umulig slik tabellen er i dag.

Håndtering i planen: ukjent sn → raden forkastes, og bridgen logger en tydelig flagget advarsel på stdout med prefikset `ALERT unresolved_sn` som inkluderer serienummeret og løpende antall forkastede meldinger for det serienummeret. Advarselen gjentas ved første treff og deretter hvert 50. forkast, slik at den fanges opp av Fly-logger og alarmer. Ingen mellomlagring – dette behandles som en konfigurasjonsfeil (dronen mangler i `drones`), ikke en tidsrace.

For de andre NOT NULL-feltene bruker bridgen `order_id = "dji-cloud"` og `time_stamp` = OSD-tidsstempel hvis det finnes, ellers nå.

**flight_status følger eksisterende konvensjon.** `flighthub2-airspace-webhook` tolker `"inflight" | "takeoff" | "flying"` som luftbåren og alt annet som på bakken. Bridgen bruker derfor `"inflight"` når OSD-`height` finnes og er > 0, ellers `"ground"`.

## Andre arkitektur-merknader

- Fly `[processes]` kjører hver prosess i **egen maskin** – `localhost:1883` vil ikke nå mosquitto. Bridgen kobler derfor til over Flys interne nettverk: `mqtt-broker-avisafe.internal:1883` (ukryptert, men internt). Samme `MQTT_USERNAME`/`MQTT_PASSWORD`.
- `mosquitto.conf` lytter allerede på `0.0.0.0:1883`, så ingen endring der.

## Hva som bygges

**`mqtt-broker/bridge.py`** (paho-mqtt + requests):
- Kobler til brokeren, abonnerer på `sys/#` og `thing/#`
- `sys/product/{sn}/status` med `method == "update_topo"` → svarer på `sys/product/{sn}/status_reply` med samme `tid`/`bid`, `timestamp + 2`, `method: "update_topo"`, `data: {"result": 0}`
- `thing/product/{sn}/osd` → tar `gateway` som sn, henter `data.latitude`, `longitude`, `height`, samt `elevation`/`altitude`, `vertical_speed`, `horizontal_speed`, `attitude_head` når de finnes (ellers null)
- Slår opp sn i `drones` med 5 minutters cache i minnet
- POST til `{SUPABASE_URL}/rest/v1/flighthub2_positions` med `apikey` + `Authorization: Bearer` + `Prefer: return=minimal`
- `raw` = hele den parsede meldingen som JSON
- Robust: try/except rundt hver melding, `reconnect_delay_set`, logging til stdout

**`mqtt-broker/requirements.txt`**: `paho-mqtt`, `requests`

**`mqtt-broker/Dockerfile`**: installerer `python3` + `py3-pip` (Alpine-basert image) og pip-avhengighetene, kopierer `bridge.py`, beholder mosquitto-oppsettet. `CMD` fjernes til fordel for prosess-kommandoer i fly.toml.

**`mqtt-broker/fly.toml`**: `[processes]` med
```text
mosquitto = "/entrypoint.sh"
bridge    = "python3 /app/bridge.py"
```
og `[[services]]` bundet til `processes = ["mosquitto"]` slik at bare brokeren eksponeres utad.

**`mqtt-broker/README.md`**: oppdateres med secrets-liste, deploy-kommandoer og feltmapping.

## Kolonnemapping (flighthub2_positions)

| Kolonne | Kilde | Null tillatt |
|---|---|---|
| company_id (uuid) | `drones.company_id` via sn | nei |
| order_id (text) | `"dji-cloud"` | nei |
| sn (text) | OSD `gateway` | nei |
| flight_status (text) | `"flying"` | nei |
| time_stamp (timestamptz) | OSD-tid eller nå | nei |
| lat / lng (float8) | `latitude` / `longitude` | nei |
| height_m (float8) | `height` | ja |
| altitude_m, vert_speed_ms, ground_speed_ms, course_deg, height_type, remote_id_status, coordinate_system, uas_id, uas_model, manufacturer_id, mission_id | null når ikke i OSD | ja |
| drone_id (uuid) | `drones.id` via sn | ja |
| raw (jsonb) | hele meldingen | ja |
| created_at | database-default `now()` | – |

Ingen endringer i AviSafe-appen eller databasen i denne planen.
