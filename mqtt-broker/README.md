# mqtt-broker-avisafe

Mosquitto MQTT-broker på Fly.io, brukt av DJI Pilot 2-skytilkoblingen (`/dji`).

`entrypoint.sh` genererer passordfila fra Fly.io-secrets MQTT_USERNAME /
MQTT_PASSWORD ved oppstart.

MQTT_USERNAME / MQTT_PASSWORD må holdes i sync med Supabase-secrets med samme
navn (brukes av edge-funksjonen `pilot-cloud-config`).
