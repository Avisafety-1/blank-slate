# Fikse "Kunne ikke hente oppsett" på /dji

## Hva loggene viser

Kl. 16:12:06 fra kontrolleren:

- `OPTIONS /functions/v1/pilot-cloud-config` → 200 (OK)
- `POST /functions/v1/pilot-cloud-config` → 405 Method Not Allowed

Det er derfor appen sier "Edge Function returned a non-2xx status code". Innlogging og token er altså ikke problemet — selve forespørselen blir avvist før den kommer så langt.

Årsaken er at versjonen som kjører i skyen fortsatt er den gamle som bare godtok GET, mens koden i prosjektet godtar både GET og POST. Klienten sender POST.

## Hva som skal gjøres

1. Publisere `pilot-cloud-config`-funksjonen på nytt slik at den kjørende versjonen er lik koden i prosjektet (godtar GET og POST, krever innlogget bruker).
2. Verifisere etterpå:
   - kall uten innlogging → 401
   - kall med gyldig innlogging → 200 med oppsettet
3. Be deg teste "Koble til" på kontrolleren en gang til, og lese loggen på siden.

Ingen endringer i resten av appen.
