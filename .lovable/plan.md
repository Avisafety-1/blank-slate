Jeg fant årsaken: `Åpne i ECCAIRS` kaller gateway-endepunktet `/api/eccairs/get-url` med bare `e2_id` og `environment`. Gatewayen har derfor ingen selskap-/incident-kontekst og bruker globale E2-credentials i stedet for per-selskap credentials. Loggen viser token-request mot UAT (`api.uat...`) og `invalid_client`, selv om raden som forsøkes åpnet ser ut til å ligge i produksjon (`OR-...` + miljø prod i nettverksloggen). Oppretting/oppdatering bruker `incident_id` og får dermed riktig credentials; åpne-funksjonen gjør ikke det.

Plan:

1. Oppdater frontend-kallet for «Åpne i ECCAIRS»
   - Endre `openInEccairs` i `src/pages/Hendelser.tsx` slik at den tar både `e2Id` og `incidentId`.
   - Legg `incident_id` på querystring sammen med `e2_id` og `environment`.
   - Endre knappen til å kalle `openInEccairs(exp.e2_id!, incident.id)`.

2. Oppdater gateway-referansen for `/api/eccairs/get-url`
   - Endre `getUrlSchema` i `supabase/functions/_shared/eccairs-gateway-server.js` til å godta valgfri `incident_id`.
   - Hvis `incident_id` finnes:
     - Kjør samme RLS-sjekk som for create/update/delete.
     - Hent `company_id` fra incidenten.
     - Kjør `loadIntegration({ company_id, environment })`.
     - Bruk `getE2AccessToken(integration)` og `integration.e2_base_url`.
   - Hvis `incident_id` mangler, behold eksisterende global fallback for bakoverkompatibilitet.

3. Forbedre fallback ved OR-utkast
   - Behold eksisterende fallback som åpner `https://aviationreporting.eu/` hvis E2 ikke returnerer direktelenke for OR-utkast.
   - Men tokenfeil skal ikke lenger skje pga. feil credentials før vi kommer dit.

4. Juster eventuelle relaterte kall
   - Sjekk vedlegg/endepunkt for samme mønster. Vedlegg sender allerede `incident_id`, så ingen frontend-endring trengs der.
   - Slette-kallet er allerede rettet til å sende `incident_id`.

5. Verifisering
   - Test at requesten til `/api/eccairs/get-url` nå inneholder `incident_id`.
   - Bekreft at gatewayen bruker per-selskap credentials i stedet for globale credentials.
   - Test både sandbox/prod-valg slik at feil miljø ikke brukes utilsiktet.

Teknisk notat:
- Databasen har credentials for selskapet i både `prod` og `sandbox`; prod peker på `https://api.aviationreporting.eu`, sandbox på `https://api.uat.aviationreporting.eu`.
- Feilen du viser kommer fra at get-url fortsatt treffer globale/UAT-credentials, ikke nødvendigvis fra credentials-raden som brukes ved oppretting/oppdatering.