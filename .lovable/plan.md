# Fikse tilkobling fra FlightHub 2 til MQTT-brokeren

Skjermbildene viser to uavhengige feil på brokeren i Fly:

1. **FlightHub 2 får «Connection Failed».** Brokerloggen sier `disconnected: not authorised` for DJI-klienten. Brukernavnet Tensio bruker (`avisafe-50c5b8af63`) finnes i AviSafe-databasen med gyldig passord, men brokeren har det ikke i passordfila si. Ingen linjer fra tilgangssynkroniseringen vises i loggen, så den kjører ikke — enten mangler Fly-hemmelighetene (`AVISAFE_CREDENTIALS_URL`, `MQTT_BROKER_API_SECRET`), eller kallet feiler stille.
2. **Brua får ikke kontakt med brokeren.** `broker connection error: [Errno 111] Connection refused – retrying in 5s` hvert 5. sekund. Årsak: brua kobler til `mqtt-broker-avisafe.internal`, som peker på *alle* maskiner i appen — også bruas egen maskin, der ingen broker lytter.

Det er også en tredje, mindre ting: FH2s «Test Connection» kobler med tom klient-ID på MQTT v3.1, som brokeren avviser som protokollfeil. Det er ufarlig for selve driften, men gjør testknappen upålitelig.

## Det jeg vil gjøre

### 1. Brua peker på riktig maskin
Endre standardadressen i `bridge.py` og `fly.toml` til prosessgruppens eget navn `mosquitto.process.mqtt-broker-avisafe.internal`, som bare treffer maskinen der brokeren faktisk kjører. Da forsvinner «Connection refused»-løkka.

### 2. Tilgangssynkroniseringen må være synlig og selvhelbredende
- Logg tydelig ved oppstart om synkroniseringen er på eller av, og hvilken adresse den bruker (uten hemmeligheter).
- Logg hvert forsøk: antall tilgangssett hentet, HTTP-statuskode ved feil, og hvilke brukernavn som ble skrevet.
- Kort ned intervallet fra 5 minutter til 60 sekunder, så et nytt/regenerert passord virker raskt.
- Hvis synkroniseringen ikke er konfigurert, skriv en tydelig ADVARSEL i loggen i stedet for én enkelt linje som drukner.

### 3. Verifiser at tilgangsfeeden svarer
Test endepunktet `mqtt-broker-credentials` direkte med den delte hemmeligheten, og bekreft at det returnerer begge tilgangssettene med serienumre. Hvis serienummerlista er tom for Tensio, blir dronen blokkert av tilgangsreglene selv med riktig passord — da retter jeg det samtidig.

### 4. Gjør testknappen i FH2 brukbar
Tillate tom klient-ID også for eldre MQTT-versjoner i brokeroppsettet, slik at «Test Connection» ikke feiler med protokollfeil.

## Etter endringen (du må gjøre dette)

- Sett hemmelighetene hvis de ikke er satt:
  `AVISAFE_CREDENTIALS_URL` og `MQTT_BROKER_API_SECRET` (samme verdi som i AviSafe).
- Kjør `fly deploy -a mqtt-broker-avisafe`.
- I FH2: host `mqtt-broker-avisafe.fly.dev`, port `8883`, brukernavn `avisafe-50c5b8af63` og passordet fra «Live posisjonsdata fra FH2» i selskapsinnstillingene.

## Teknisk

- `mqtt-broker/bridge.py`: `MQTT_BRIDGE_HOST` default → `mosquitto.process.mqtt-broker-avisafe.internal`.
- `mqtt-broker/fly.toml`: sett `MQTT_BRIDGE_HOST` eksplisitt i `[env]` for bridge-prosessen.
- `mqtt-broker/credsync.py`: oppstartslogg, per-forsøk-logg med statuskode og brukernavn, `CRED_SYNC_INTERVAL` default 60.
- `mqtt-broker/entrypoint.sh`: ADVARSEL når synkroniseringen er deaktivert.
- `mqtt-broker/mosquitto.conf`: `allow_zero_length_clientid true` gjelder allerede; legger til `max_keepalive`/protokolltoleranse slik at v3.1-probe ikke kastes ut.
- Verifisering: kall `mqtt-broker-credentials` med `x-broker-secret` og sjekk `serial_numbers` per sett.
