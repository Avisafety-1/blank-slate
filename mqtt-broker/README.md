# mqtt-broker-avisafe

Mosquitto MQTT-broker på Fly.io, brukt av DJI Pilot 2-skytilkoblingen (`/dji`).

Merk: filene under ble limt inn i chatten, og innholdet i `entrypoint.sh` og
`mosquitto.conf` kom bortforbi hverandre underveis — de er derfor IKKE lagret
her ennå. Lim inn riktig innhold for:

- `entrypoint.sh` (skal sannsynligvis lese MQTT_USERNAME / MQTT_PASSWORD fra
  Fly.io secrets og generere passordfil, deretter starte mosquitto)
- `mosquitto.conf` (listener 1883, allow_anonymous false, password_file)

MQTT_USERNAME / MQTT_PASSWORD må holdes i sync med Supabase-secrets med samme
navn (brukes av edge-funksjonen `pilot-cloud-config`).
