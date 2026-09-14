# DJI Pilot 2-innlogging på app.avisafe.no/dji

## Mål

Operatøren åpner `https://app.avisafe.no/dji` i DJI Pilot 2 (Cloud Service > Andre plattformer). Ingen token i URL-en. Er man ikke innlogget, vises en enkel innloggingsboks på siden; etter innlogging hentes DJI-konfigurasjonen automatisk og «Koble til» kjører tilkoblingen.

## Slik løses det

### 1. Ny side `/dji` (erstatter den statiske HTML-filen)

- Ny React-side `src/pages/DjiCloudLogin.tsx`, registrert i `App.tsx` som en frittstående rute utenfor `AuthenticatedLayout` — ingen meny, header eller plan-sperre.
- Ruten registreres med `React.lazy()` + `Suspense`, slik at siden og dens avhengigheter havner i en egen kodepakke. Da kan ikke nyere JS-syntaks andre steder i appen hindre at siden laster i RC Plus' eldre nettleser.
- Siden har tre tilstander:
  1. **Ikke innlogget**: e-post + passord-felt og «Logg inn»-knapp (bruker samme innlogging som resten av appen).
  2. **Innlogget, henter oppsett**: kaller `pilot-cloud-config` med brukerens sesjon.
  3. **Klar**: stor «Koble til»-knapp.
- «Koble til» kjører samme sekvens som i dag: lisensverifisering → last «thing»-komponent → MQTT-tilkobling, med eksplisitt felt-mapping `mqttHost -> host`, `mqttUsername -> username`, `mqttPassword -> password`.
- Statuslogg linje for linje på siden (hentet oppsett, lisens, komponent, tilkoblingsresultat, feil), akkurat som i dag.
- Mangler `window.djiBridge`, vises melding om at siden må åpnes i DJI Pilot 2.
- Fordi appen allerede bygges for DJI RC Plus (Chromium 70) fungerer siden i kontrollerens nettleser.
- `public/pilot-cloud-login.html` slettes. Trenger dere den gamle adressen en stund til, sier dere fra så legger jeg inn en videresending.

### 2. Edge-funksjonen `pilot-cloud-config` endres fra token til innlogging

- `?token=`-sjekken og hemmeligheten `PILOT_CLOUD_TOKEN` fjernes.
- Funksjonen krever i stedet en gyldig innlogget bruker (`Authorization: Bearer <JWT>`) og validerer den i koden med den delte hjelperen som allerede brukes av andre funksjoner.
- Tilgangsregel: enhver innlogget Avisafe-bruker med aktiv konto får oppsettet. (Si fra hvis det heller bør begrenses til administratorer.)
- De seks DJI-/MQTT-hemmelighetene leses som før; `MQTT_HOST` sendes videre som full URI med scheme og port.
- Wildcard-CORS beholdes, og `Authorization` tillates i CORS-headerne.
- Kommentaren om at `MQTT_USERNAME`/`MQTT_PASSWORD` må holdes i sync med mosquitto-brokeren på Fly.io beholdes.

### 3. Tekster

Nye tekster legges inn på norsk og engelsk (`no.json` / `en.json`) under `dji.cloudLogin.*`.

## Verifisering

- `/dji` uten innlogging viser innloggingsboksen, ikke en feilside.
- `pilot-cloud-config` uten gyldig innlogging gir 401; med innlogging gir 200 med alle felt.
- Innlogget `/dji` viser «Koble til» og djiBridge-meldingen i vanlig nettleser.

## Avgrensning

- Ingen endring i eksisterende DJI-/FlightHub-flyter.
- Ingen hemmeligheter i kode eller i sidens adresse.
