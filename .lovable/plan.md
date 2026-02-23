

# Oppdater DroneLog API-nøkkel og test tilkobling

## Trinn

1. **Oppdater secret** -- Erstatt `DRONELOG_AVISAFE_KEY` med den nye nøkkelen `Lu6aSSEH...Gjn8H`.

2. **Kjør helsesjekk** -- Send en GET-forespørsel til `process-dronelog` edge-funksjonen for å verifisere at den nye nøkkelen autoriseres mot DroneLog API.

3. **Evaluer resultat**
   - Hvis vi får JSON tilbake med feltlisten: nøkkelen fungerer.
   - Hvis vi fortsatt får HTML: nøkkelen er ugyldig eller DroneLog API har et annet problem.

### Tekniske detaljer

| Steg | Verktøy | Detaljer |
|------|---------|---------|
| Oppdater secret | `add_secret` | `DRONELOG_AVISAFE_KEY` = ny nøkkel |
| Test tilkobling | `curl_edge_functions` | `GET /process-dronelog` |

Ingen kodeendringer er nødvendig -- bare secret-oppdatering og test.

