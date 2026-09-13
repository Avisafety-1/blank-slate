# DJI Pilot 2 Cloud-login-side

## Hva bygges

En frittstående HTML-side og en ny Edge Function som lar DJI Pilot 2 (Cloud Service > Andre plattformer) hente Avisafes DJI Cloud-konfigurasjon og koble til MQTT direkte fra fjernkontrollens innebygde nettleser.

### 1. Edge Function `pilot-cloud-config` (ny)

- `GET` uten innlogging, men med obligatorisk `?token=`-parameter.
- Token sammenlignes med en hemmelighet `PILOT_CLOUD_TOKEN` i funksjonens miljøvariabler; feil eller manglende token gir `403`.
- Returnerer JSON `{ appId, appKey, license, mqttHost, mqttUsername, mqttPassword }`, der alle verdier leses fra Supabase-hemmeligheter: `DJI_APP_ID`, `DJI_APP_KEY`, `DJI_LICENSE`, `MQTT_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD`.
- `MQTT_HOST` inneholder hele tilkoblings-URI-en inkludert scheme og port (f.eks. `ssl://mqtt-broker-avisafe.fly.dev:8883`). Scheme/port konstrueres ikke i funksjonen eller på klienten — verdien sendes videre som den er.
- Ingen verdier hardkodes i funksjonskroppen; manglende hemmelighet gir `500` med navnet på den manglende variabelen.
- `Access-Control-Allow-Origin: *` (wildcard) på alle svar, inkludert feil — DJI RC Plus' webview kan sende uvanlig eller tom `Origin`-header som en domenebegrenset CORS-policy ville avvist. `OPTIONS` håndteres, `verify_jwt = false` registreres i `supabase/config.toml`.
- Én linjes kommentar i funksjonen (ikke runtime-sjekk): `MQTT_USERNAME`/`MQTT_PASSWORD` må holdes i sync med credentialene som er hashet inn i mosquitto-brokerens passordfil på den separate Fly.io-appen `mqtt-broker-avisafe` — de lever i to ulike repoer og synkes ikke automatisk.

### 2. Statisk side `public/pilot-cloud-login.html` (ny)

- Ren HTML + vanilla JS, ingen React, ingen importer fra appen — serveres som den er av Vite under `/pilot-cloud-login.html`.
- Kompatibel med DJI RC Plus' innebygde webview (Chromium 70): enkel JS uten nyere syntaks enn Chrome 70 støtter.
- Ved lasting henter siden config fra `pilot-cloud-config` med `?token=` hentet fra sidens egen URL (operatøren åpner `https://app.avisafe.no/pilot-cloud-login.html?token=...` på kontrolleren).
- En tydelig «Koble til»-knapp som kjører sekvensen:
  1. `window.djiBridge.platformVerifyLicense(appId, appKey, license)`
  2. `window.djiBridge.platformLoadComponent("thing", JSON.stringify({ host, connectCallback: "reg_callback", username, password }))`
  3. `window.djiBridge.thingConnect(mqttUsername, mqttPassword, "reg_callback")`
- Felt-mapping fra config-JSON til djiBridge-parametere gjøres eksplisitt i connect-handleren, ikke implisitt:
  ```js
  var host = config.mqttHost;       // -> "host"
  var username = config.mqttUsername; // -> "username"
  var password = config.mqttPassword; // -> "password"
  ```
  slik at det er synlig at `mqttHost -> host`, `mqttUsername -> username`, `mqttPassword -> password`.
- Global `reg_callback`-funksjon mottar tilkoblingsresultatet fra DJI Pilot 2.
- All status (config hentet, lisens OK, component lastet, tilkoblingsresultat, feil) logges linje for linje i en enkel `<ul>` på siden.
- Guard: hvis `window.djiBridge` mangler, vises en tydelig melding om at siden må åpnes i DJI Pilot 2.
- Norsk/engelsk: siden er standalone uten i18n-systemet; tekster holdes på engelsk (DJI-terminologi), unntatt enkel statuslinje.

### 3. Hemmeligheter

- `PILOT_CLOUD_TOKEN` genereres med `generate_secret` (tilfeldig verdi, kun Avisafe trenger den — operatøren får ferdig URL).
- De seks DJI-/MQTT-hemmelighetene sjekkes med `fetch_secrets`; de som mangler forespørres via `add_secret` før funksjonen testes.

### 4. Verifisering

- `curl` mot `pilot-cloud-config` uten token → 403, med token → 200 med alle felt.
- Åpne siden i nettleser og bekrefte at djiBridge-guard-meldingen vises.
- Ingen hemmeligheter i kode, logger eller siderespons utover selve config-JSON til autorisert token.

## Avgrensning

- Siden får ingen deling av layout, auth eller navigasjon med resten av appen.
- Token i URL er den eneste beskyttelsen (DJI Pilot 2 kan ikke gjøre interaktiv innlogging) — tokenet bør roteres hvis det lekker.
- Ingen endring i eksisterende DJI-/DroneLog-flyter.
