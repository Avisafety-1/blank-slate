# Fikse credsync-skriving og bruas tilkobling

## 1. Passordfila bygges opp på nytt hver gang (kritisk)

I dag skrives fila med «opprett ny»-flagget på første bruker ved hver synk, og det feiler ved gjentatte kjøringer. Resultatet er at de to credential-settene som faktisk hentes fra Supabase aldri havner i fila, og kunder får «not authorised».

Ny oppførsel i `credsync.py`:
- Bygg alltid en midlertidig fil `/mosquitto/data/passwd.tmp` fra bunnen.
- Skriv én oppføring per hentet credential-sett, uten «opprett ny»-flagget.
- Behold fellesbrukeren (`MQTT_USERNAME`/`MQTT_PASSWORD`, i praksis «dji») som en egen, eksplisitt linje – den er fortsatt i bruk.
- Bytt fila inn atomisk over den gamle, sett rettigheter 600, og send deretter HUP til mosquitto som i dag.
- Fordi hele fila bygges på nytt, forsvinner deaktiverte credentials automatisk.
- Logg antall brukere skrevet til den nye fila, og antall linjer i fila etter innbyttet, slik at loggen viser om skrivingen faktisk lyktes.

Merk: brukernavn/passord «dji» / «Test123456!» finnes ikke i koden – de kommer fra Fly-hemmelighetene `MQTT_USERNAME`/`MQTT_PASSWORD`. Fellesbrukeren blir altså den verdien som er satt der.

## 2. Bruas tilkobling

Koden og `fly.toml` bruker allerede port 1883 internt (8883 finnes kun som TLS-terminering i Fly sin kant). Hvis «Connection refused» fortsatt kommer, er en Fly-hemmelighet `MQTT_BRIDGE_PORT` satt til 8883 – hemmeligheter overstyrer `fly.toml`.

Endring i `bridge.py`:
- Logg ved oppstart, før første tilkoblingsforsøk, nøyaktig hvilken host og port brua bruker.
- Avvis/korriger port 8883 for den interne tilkoblingen: hvis porten er satt til 8883, bruk 1883 og logg en tydelig linje om at verdien ble overstyrt.

## Etter endringen (du gjør dette)

- `fly deploy -a mqtt-broker-avisafe`
- Sjekk loggen: credsync skal vise antall skrevne brukere uten «File exists», og brua skal vise «connecting to mosquitto.process…:1883» etterfulgt av tilkobling.
- Kjør gjerne `fly secrets list -a mqtt-broker-avisafe` og bekreft at `MQTT_BRIDGE_PORT` enten mangler eller er 1883.

## Teknisk

- `mqtt-broker/credsync.py`: ny `write_passwd` med `PASSWD_TMP`, `mosquitto_passwd -b` uten `-c`, `os.replace`, `os.chmod 0o600`, logging av antall før/etter.
- `mqtt-broker/bridge.py`: oppstartslogg av `MQTT_HOST:MQTT_PORT`; klemming av 8883 → 1883 med advarsel.
- Ingen endring i håndtering av tom klient-ID / MQTT v3.1.
