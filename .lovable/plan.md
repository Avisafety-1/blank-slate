

## Diagnose: FlightHub 2 401 -- nøkkeltype og FlightHub Sync-aktivering

### Hva vi vet nå

Etter grundig gjennomgang av **all** DJI-dokumentasjon:

1. **To separate API-er, begge feiler med 401:**
   - Ny OpenAPI: `GET /openapi/v0.1/project` + `X-User-Token` → 401
   - Gammel FlightHub Sync: `GET /manage/api/v1.0/projects` + `X-Organization-Key` → 401
   - Begge mot US og CN → 401 alle 4 kombinasjoner

2. **Koden er korrekt.** URL-er, headers, og token-håndtering matcher dokumentasjonen perfekt. Tokenet trimmes, har riktig lengde (452), er en gyldig JWT med riktig org_uuid, og er ikke utløpt.

3. **`system_status` krever ingen autentisering** (bekreftet i OpenAPI-spesifikasjonen: `security: []`). At den returnerte "Tilkoblet!" tidligere betyr bare at serveren svarer -- det sier ingenting om nøkkelen.

### Mest sannsynlig årsak

FlightHub Sync-dokumentasjonen sier at **storage bucket MÅ konfigureres** for at file sync (inkludert route upload) skal fungere. Uten konfigurert bucket kan det hende at DJI ikke aktiverer API-tilgangen fullt ut.

Men 401 på bare å **liste prosjekter** burde ikke kreve bucket. Derfor er det mest sannsynlig et **nøkkel-problem**:

- Nøkkelen kan være fra feil sted (OpenAPI-seksjonen vs FlightHub Sync-seksjonen)
- Nøkkelen kan kreve at FlightHub Sync er fullt aktivert med bucket

### Plan: Isoler problemet

**1. Legg til en direkte API-test i edge function** som logger absolutt alt:
- Full HTTP request (alle headers, URL, metode)
- Full HTTP response (status, alle response headers, body)
- Spesifikt: sjekk om DJI returnerer noe i response headers som forklarer 401 (f.eks. `X-Error-Code`, `X-Rate-Limit`, etc.)

**2. Legg til en "raw test"-action** i proxy:
- Tar inn en vilkårlig URL + header-navn + token
- Gjør kallet og returnerer alt
- Slik at vi kan teste direkte fra admin-UI uten å gå via Apifox

**3. Oppdater admin-UI med tydeligere veiledning:**
- Vis tydelig melding: "Nøkkelen avvises av DJI. Prøv å generere en ny nøkkel under FlightHub 2 → Organization Settings → FlightHub Sync → Organization Key"
- Legg til lenke til DJI-dokumentasjonen
- Vis knapp for "Test direkte mot DJI" som viser full request/response

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- legg til raw-test action med full request/response logging
2. `src/components/admin/ChildCompaniesSection.tsx` -- vis tydeligere feilmelding og veiledning ved 401

