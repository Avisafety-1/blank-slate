## Funn

DJI når nå Edge Functionen, men den kaller ikke bare POST-webhooken fra dokumentasjonen. Under verifisering sender DJI også:

```text
GET /flighthub2-airspace-webhook/v1/uav?lat=22.5431&lng=114.0579&radius=100
```

Funksjonen vår aksepterer kun POST og svarer derfor `405 Method Not Allowed`. Det er derfor DJI viser `API verification failed`.

`Service provider name = avisafe` er fortsatt ikke problemet.

## Plan

1. **Støtt DJI sin GET-verifisering**
   - Legg inn en egen GET-handler i `flighthub2-airspace-webhook` for path som slutter på `/v1/uav`.
   - Returner `200` med JSON-liste, typisk `[]`, slik at DJI sin API-test består.
   - Godta både `radius` og `rad` som query-parametre, siden DJI bruker `radius` mens SafeSky bruker `rad`.

2. **Behold eksisterende POST-webhook for live droneposisjoner**
   - POST-logikken med HMAC-signatur, org-oppslag og lagring i `flighthub2_positions` beholdes.
   - GET-verifisering skal ikke omgå eller svekke HMAC-sjekken for faktiske POST-telemetridata.

3. **Logg GET-verifisering tydelig**
   - Legg til ikke-sensitive logger for method, path, lat/lng/radius og headers.
   - Da kan vi se direkte om DJI får 200 etter neste test.

4. **Deploy og test Edge Functionen**
   - Deploy `flighthub2-airspace-webhook`.
   - Test samme GET-kall som DJI brukte og bekreft `200`.
   - Test en ugyldig path/metode slik at den fortsatt avvises riktig.

## Teknisk detalj

Dette er sannsynligvis fordi FH2 Airspace-integrasjonen forventer at leverandøren også eksponerer et `/v1/uav`-kompatibelt API for å hente nærliggende trafikk, ikke bare en webhook for å motta droneposisjoner. Første steg er å returnere gyldig tom respons for verifisering; senere kan endpointet eventuelt kobles til SafeSky/annen trafikkdata hvis DJI faktisk bruker det operativt.