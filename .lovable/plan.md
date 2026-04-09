

## Fiks "unauthorized" og "Ingen prosjekter funnet" i FlightHub 2 Send-dialogen

### Problem
To separate problemer:

1. **`list-projects` mangler robust feilhåndtering**: Kallet gjør `res.json()` uten å sjekke `res.ok` eller content-type. Hvis DJI returnerer 401/403 med HTML eller en feilmelding, krasjer parsingen eller feilen vises ikke tydelig.

2. **Selskaps-hierarki ikke håndtert**: Edge-funksjonen henter `flighthub2_token` kun fra brukerens eget selskap. Hvis token er konfigurert på morselskapet, men brukeren tilhører en underavdeling, finner den ingen token og returnerer feil. Dette er sannsynligvis hovedproblemet -- brukeren konfigurerte FH2 på ett selskap men er logget inn med et annet.

### Løsning

**1. Edge function (`flighthub2-proxy/index.ts`)**

- **Arv fra morselskap**: Etter å ha hentet brukerens company, sjekk om `flighthub2_token` er null. Hvis ja, slå opp `parent_id` og hent token fra morselskapet (ett nivå opp).
- **Robust `list-projects`**: Les respons som tekst først, sjekk content-type og status, og parse JSON kun hvis det er JSON. Logg status og responskropp for debugging.
- **Bedre feilmeldinger**: Vis DJI-status og melding i responsen tilbake til klienten.

**2. Send-dialogen (`FlightHub2SendDialog.tsx`)**

- Vis den faktiske feilmeldingen fra API-et (f.eks. "unauthorized") i toast i stedet for bare "Kunne ikke hente prosjekter".

### Teknisk endring

**`supabase/functions/flighthub2-proxy/index.ts`**:
```text
1. Etter company-oppslag, hvis flighthub2_token er null:
   → Hent parent_id fra companies-tabellen
   → Hvis parent_id finnes, hent token fra morselskapet
2. list-projects: erstatt res.json() med res.text() + JSON.parse + feilhåndtering (samme mønster som test-connection)
3. Legg til console.log for list-projects status og respons
```

**`src/components/FlightHub2SendDialog.tsx`**:
```text
- I fetchProjects: vis data?.message eller data?.error i toast
```

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- parent company fallback + robust list-projects
2. `src/components/FlightHub2SendDialog.tsx` -- bedre feilvisning

