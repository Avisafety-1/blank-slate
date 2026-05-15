Status nå:
- `Service provider name = avisafe` er ikke problemet. Det feltet er bare visningsnavn hos DJI.
- Avisafe har lagret webhook-konfigurasjon med org `4593f426-e454-4ba5-8246-92b109bb0a12`, token finnes, og webhook er aktivert.
- DJI ser ut til å treffe Edge Function, men funksjonen logger ikke hvilken validering som feiler. Derfor får vi bare “API verification failed” i DJI uten nok sporbarhet.

Plan:
1. Legg inn sikker, ikke-sensitiv diagnostikk i `flighthub2-airspace-webhook`:
   - logg om request mangler headers, har feil timestamp, ukjent org, deaktivert config eller invalid signature
   - logg kun trygge metadata: org-id, body-lengde, token-lengde, signatur-lengde og prefix/suffix – aldri full token eller full signatur

2. Gjør webhooken mer tolerant mot DJIs verify-test:
   - tillat både header-varianter som `signature`, `timestamp`, `nonce` og mulige store/små bokstaver håndteres allerede av Fetch Headers
   - vurder å ikke avvise på 5-minutters timestamp-skew under DJI-verifisering hvis dette viser seg å være årsaken
   - behold HMAC-verifisering for faktiske posisjonsdata

3. Legg inn en lokal/Edge Function-test for DJIs signaturformat:
   - bruk samme HMAC-regel som dokumentasjonen: `timestamp + nonce + rawBody`
   - test at lagret webhook-logikk aksepterer korrekt signatur og avviser feil signatur

4. Etter endringen:
   - deploy/test webhook-funksjonen
   - kall den med en syntetisk signert request for å bekrefte at den returnerer `{ code: "0", result: "success" }`
   - sjekk Edge Function-logger etter nytt DJI Verify-forsøk for eksakt årsak hvis DJI fortsatt feiler

Mest sannsynlige årsaker som denne planen avklarer:
- token i DJI er ikke nøyaktig samme som den lagrede i Avisafe
- DJI sender `flight_hub_organization_id` som ikke matcher org-id i FH2 OAuth-tokenet
- DJI verify-request har tom/annen body eller timestamp-skew som dagens funksjon avviser
- signaturberegningen stemmer ikke med hva DJI faktisk sender i verify-kallet