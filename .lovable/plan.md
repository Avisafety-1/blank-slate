# /dji viser gammel versjon på kontrolleren

## Hva loggene viser

`pilot-cloud-config` ble kalt flere ganger nå sist (16:22–16:23) og svarte uten feil — ingen 401, 405 eller andre feil. Backend er altså i orden; problemet ligger i at kontrolleren kjører en gammel utgave av selve siden.

## To ting kan gi gammel side

1. Endringene i loggvisningen er gjort i prosjektet, men `app.avisafe.no` viser sist publiserte utgave. Er appen ikke publisert etter siste endring, får kontrolleren den gamle siden uansett.
2. Appen har en offline-mellomlagring (PWA) som lagrer sidene lokalt. DJI Pilot 2 sin innebygde nettleser henter da gammel utgave selv etter publisering.

## Hva som skal gjøres

1. Publisere appen på nytt, slik at siste utgave av `/dji` faktisk ligger ute.
2. Legge inn en versjonslinje øverst i loggen på `/dji` (dato/versjon for utgaven som kjører), så du med én gang ser om kontrolleren har fått ny utgave.
3. Gjøre `/dji` uavhengig av offline-mellomlagringen: siden melder seg av tjenestearbeideren og tømmer lagrede filer når den åpnes, slik at den alltid lastes fersk i kontrolleren.
4. Legge til en "Tøm buffer og last på nytt"-knapp på siden som nødløsning.
5. Du åpner `/dji` på kontrolleren igjen, sjekker at versjonslinjen stemmer, og sender loggen fra "Koble til".

## Teknisk

- `src/pages/DjiCloudLogin.tsx`: logg `import.meta.env.VITE_APP_VERSION` ved oppstart; ved mount kalle `navigator.serviceWorker.getRegistrations()` → `unregister()` og `caches.keys()` → `caches.delete()` når stien er `/dji`; knapp som gjør det samme og deretter `location.reload()`.
- Nye tekster under `djiCloud.*` i både `no.json` og `en.json`.
- Ingen endringer i edge-funksjonen eller resten av appen.
