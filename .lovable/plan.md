
Mest sannsynlige årsak er at vi tester feil ting i dag.

Hva jeg fant:
- `list-projects` kaller riktig endepunkt: `GET /openapi/v0.1/project?...`
- Nettverksloggen viser at DJI faktisk svarer:
  `401 {"code":200401,"message":"Unauthorized"}`
- `test-connection` kaller derimot `GET /openapi/v0.1/system_status`
- I dokumentasjonen for `system_status` vises ingen `X-User-Token`, mens prosjektlisten eksplisitt krever organisasjonsnøkkel og riktig autorisering

Det betyr:
- Base URL-en din ser riktig ut nå
- Problemet er ikke at prosjektkallet mangler i koden
- Problemet er at FlightHub-nøkkelen som er lagret ikke har gyldig autorisering for prosjekt-endepunktet, eller at vi bruker feil type nøkkel

Plan

1. Stram inn testflyten i admin
- Endre `Test tilkobling` så den tester både:
  - `system_status`
  - `list-projects`
- Vis tydelig forskjell:
  - “Server svarer” hvis bare systemstatus virker
  - “Organisasjonsnøkkel godkjent” først når prosjektlisten faktisk returnerer prosjekter eller tom gyldig liste
- Hvis DJI svarer `200401 Unauthorized`, vis en konkret melding om at nøkkelen ikke er gyldig for organisasjons-/prosjekt-API

2. Forbedre diagnostikk i edge-funksjonen
- Behold `list-projects`, men normaliser feilsvar bedre
- Returner DJI `code`, `message`, HTTP-status og hvilken URL/action som feilet
- Gjør `test-connection` mindre “grønn” ved å returnere delstatus, ikke bare suksess

3. Oppdatere UI i FlightHub 2-dialogen
- Bytt ut “Ingen prosjekter funnet” med mer presis status:
  - “Ugyldig eller ikke-autorisert organisasjonsnøkkel”
  - “Ingen prosjekter finnes under organisasjonen”
  - “Tilkobling OK, men prosjektlisten krever annen nøkkel/tilgang”
- Dette gjør at brukeren skjønner forskjellen på tom liste og auth-feil

4. Legg inn dokumentasjonshjelp i innstillingene
- Ved token-feltet: forklar at det må være FlightHub Sync Organization Key
- Legg til kort tekst om at nøkkelen må ha tilgang til prosjektene som skal brukes
- Eventuelt vise tips:
  - sjekk at det faktisk finnes prosjekter i samme organisasjon
  - sjekk at nøkkelen tilhører riktig region/base URL
  - sjekk at nøkkelen ikke er fra feil miljø/organisasjon

5. Verifisering etter implementasjon
- Test i admin med samme nøkkel:
  - `system_status` skal kunne være OK
  - `list-projects` må også være OK
- Åpne send-dialogen og bekreft at enten:
  - prosjektlisten lastes inn, eller
  - brukeren får en presis auth-feil i stedet for “Ingen prosjekter funnet”

Teknisk vurdering
- Dokumentasjonen støtter at `X-User-Token`/organisasjonsnøkkel er nødvendig for prosjektlisten
- Nåværende kode bruker riktig prosjekt-endepunkt, så vi gjør neppe “helt feil” på URL lenger
- Den viktigste feilen er at dagens test-endepunkt gir falsk trygghet
- Derfor bør vi ikke fokusere mer på base URL nå, men på nøkkeltype/autorisering og tydeligere feilmeldinger

Filer som bør oppdateres
- `supabase/functions/flighthub2-proxy/index.ts`
- `src/components/admin/ChildCompaniesSection.tsx`
- `src/components/FlightHub2SendDialog.tsx`
