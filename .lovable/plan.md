

## Fiks FlightHub 2 DNS-feil og forbedre tilkoblingstest

### Problem
Base URL `https://api.dji.com` finnes ikke (DNS-feil). DJI FlightHub 2 API-dokumentasjonen bruker kun relative stier (f.eks. `/openapi/v0.1/project`) uten å spesifisere en base URL. Base URL avhenger av om man bruker DJI cloud eller on-premises-installasjon.

### Analyse
Fra dokumentasjonen:
- Alle API-endepunkter bruker stier som `/openapi/v0.1/...`
- `X-User-Token` er organisasjonsnøkkelen fra FlightHub Sync
- Det finnes et `system_status`-endepunkt (`GET /openapi/v0.1/system_status`) som kan brukes til testing
- Storage-opplasting bruker Alibaba Cloud OSS med STS-credentials

### Løsning

**1. Legg til predefinerte base URL-valg i admin UI**

I stedet for kun et fritekstfelt, legg til en dropdown med kjente alternativer:
- `https://fh.dji.com` (DJI Cloud - Global)
- `https://fh2-api.dji.com` (DJI Cloud - API)  
- Egendefinert URL (fritekst)

**2. Forbedre test-funksjonen**

- Bruk `system_status`-endepunktet (`/openapi/v0.1/system_status`) i stedet for `list-projects` for test -- det er enklere og krever ikke `X-Project-Uuid`
- Legg til en ny `test-connection` action i edge function
- Vis den faktiske URL-en som ble forsøkt i feilmeldingen slik at brukeren kan feilsøke

**3. Oppdater edge function**

- Legg til `test-connection` action som kaller `system_status`
- Inkluder den forsøkte URL-en i feilmeldinger ved DNS/nettverksfeil
- Bedre feilhåndtering med spesifikke meldinger for DNS-feil vs. auth-feil

### Tekniske detaljer

**`src/components/admin/ChildCompaniesSection.tsx`**
- Endre base URL-input til Select + Input-kombo
- Test-knappen bruker ny `test-connection` action
- Vis forsøkt URL i feilmelding

**`supabase/functions/flighthub2-proxy/index.ts`**
- Ny action `test-connection` som kaller `/openapi/v0.1/system_status`
- Wrapp fetch-kall i try/catch med DNS-spesifikk feilmelding som inkluderer URL
- Redeploy etter endring

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- ny test-connection action, bedre feilmeldinger
2. `src/components/admin/ChildCompaniesSection.tsx` -- dropdown for base URL, forbedret test

