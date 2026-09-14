# Neste steg på /dji: finne ut hvorfor tilkoblingen svarer "false"

## Hva loggen viser nå

Oppsettet hentes riktig (16:15:34 "Oppsett hentet. Klar til å koble til"), så feilen fra før er løst.

Deretter kjøres alle tre stegene, men svaret fra kontrolleren er `reg_callback: false` — altså at DJI Pilot 2 avviser tilkoblingen. Loggen viser bare "called" for hvert steg, fordi vi i dag ikke leser hva DJI faktisk svarer på hvert kall. Uten det kan vi ikke se om det er lisensen eller selve MQTT-tilkoblingen som feiler.

De to vanligste årsakene:

1. Lisensen (app-ID/nøkkel/lisens) er ikke gyldig for adressen `app.avisafe.no` — DJI-lisenser er låst til ett bestemt domene og én app-ID.
2. MQTT-tjeneren avviser brukernavn/passord eller adressen mangler riktig format/port.

## Hva som skal gjøres

1. Vise DJI sitt faktiske svar for hvert steg i loggen på siden: lisenskontroll, lasting av "thing"-komponenten og tilkoblingen. DJI returnerer en kode og en melding — den skrives ut ordrett.
2. Stoppe videre steg hvis lisenskontrollen feiler, og vise en tydelig melding om at lisensen ikke er gyldig for denne adressen, i stedet for å fortsette til tilkobling.
3. Vise MQTT-adressen (uten passord) i loggen, slik at feil adresse/port oppdages med en gang.
4. Legge til en "Kopier logg"-knapp så du enkelt kan sende hele loggen videre.
5. Du tester på nytt, og ut fra den nye loggen retter vi enten lisensverdiene eller MQTT-innstillingene.

## Teknisk

- Endringer kun i `src/pages/DjiCloudLogin.tsx`: fange returverdiene fra `platformVerifyLicense`, `platformLoadComponent` og `thingConnect` (DJI returnerer JSON-strenger), parse `code`/`message`/`data`, og logge dem.
- Ingen endringer i edge-funksjonen eller resten av appen. Nye tekster legges i både no.json og en.json.
