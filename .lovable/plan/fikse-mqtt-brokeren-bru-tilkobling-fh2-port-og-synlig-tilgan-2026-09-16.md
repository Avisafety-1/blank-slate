# Fikse MQTT-brokeren: bru-tilkobling, FH2-port og synlig tilgangssynk

Jeg har gått gjennom de tre punktene mot den faktiske konfigurasjonen. To stemmer, ett er allerede på plass.

## 1. Brua kobler til feil maskin (riktig – høyeste prioritet)

`bridge.py` bruker `mqtt-broker-avisafe.internal`, som Fly løser til alle maskiner i appen, inkludert bruas egen maskin der ingen broker lytter. Det gir «Connection refused» hvert 5. sekund, akkurat som i loggen.

Endring:
- Standardadressen i `bridge.py` blir `mosquitto.process.mqtt-broker-avisafe.internal`.
- Samme verdi settes eksplisitt for bru-prosessen i `fly.toml`, så den ikke kan bomme.

## 2. Klartekst-port 1883 for FlightHub 2 (allerede på plass – ingen endring nødvendig)

`fly.toml` eksponerer allerede port 1883 utad uten TLS-handler på samme mosquitto-tjeneste, ved siden av 8883 med TLS. FH2 Sync kan altså allerede nå frem til autentiseringen på 1883.

Jeg legger derfor kun til:
- En tydelig sikkerhetskommentar i `fly.toml` og `README.md` om at brukernavn, passord og posisjoner går i klartekst på 1883, at dette er en bevisst avveining fordi FH2 Sync ikke støtter TLS, og at kommentaren ikke skal fjernes.
- Bekreftelse av at autentisering og tilgangsregler gjelder likt på begge porter – det gjør de, siden Mosquitto kun har én lytter (1883) med passordfil og ACL, og 8883 bare er TLS-terminering i Fly sin kant mot samme lytter.

## 3. Tilgangssynkroniseringen må være synlig og raskere (riktig)

I `credsync.py`:
- Oppstartslinje som sier om synk er konfigurert, og hvilken adresse som brukes (aldri hemmeligheten).
- Per forsøk: tidspunkt, antall tilgangssett, HTTP-statuskode ved feil, og hvilke brukernavn som ble skrevet til passordfila.
- Intervall ned fra 5 minutter til 60 sekunder.
- Er synk ikke konfigurert: linje med prefiks `ADVARSEL:` ved hvert forsøk, ikke bare én gang ved oppstart. Dette flyttes inn i en løkke i `entrypoint.sh`/`credsync.py` slik at advarselen gjentas.

Jeg rører ikke tom-klient-ID/MQTT v3.1-oppførselen, slik du ba om.

## Forventet resultat

- «Connection refused» forsvinner fra bruas logg; eventuelle gjenværende feil vises som «not authorised», altså et rent credential-problem.
- FH2-tilkoblinger på 1883 når frem til autentisering i Mosquitto.
- Loggen viser hvilke brukernavn brokeren faktisk kjenner til, så feil passord kan avgjøres på sekunder.

## Etter endringen (du gjør dette)

- Sett `AVISAFE_CREDENTIALS_URL` og `MQTT_BROKER_API_SECRET` på Fly hvis de ikke er satt.
- `fly deploy -a mqtt-broker-avisafe`.
- I FH2 Sync: host `mqtt-broker-avisafe.fly.dev`, port `1883` (TCP), brukernavn og passord fra «Live posisjonsdata fra FH2» i selskapsinnstillingene.

## Teknisk

- `mqtt-broker/bridge.py`: `MQTT_BRIDGE_HOST` default → `mosquitto.process.mqtt-broker-avisafe.internal`; docstring oppdatert.
- `mqtt-broker/fly.toml`: `[env]` for bridge-prosessen med samme host; kommentarblokk over 1883-porten om klartekst-avveiningen.
- `mqtt-broker/credsync.py`: `CRED_SYNC_INTERVAL` default 60; oppstartslogg med URL; per-forsøk-logg med antall sett, statuskode ved `requests`-feil og liste over skrevne brukernavn; gjentatt `ADVARSEL:`-linje når URL/secret mangler i stedet for `sys.exit`.
- `mqtt-broker/entrypoint.sh`: starter credsync også uten konfigurasjon, slik at advarselen gjentas.
- `mqtt-broker/README.md`: seksjon om portene 1883 (klartekst, FH2 Sync) og 8883 (TLS, Pilot 2).
