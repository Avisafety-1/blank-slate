
Mål: Forklare hvorfor du får "API-grensen nådd" og plan for å rette dette.

Funn:
- `process-dronelog` bruker **selskapsspesifikk nøkkel** (`companies.dronelog_api_key`) når den finnes. Edge-logg bekrefter dette for company `a6698b2d-8464-4f88-9bc4-ebcc072f629d`.
- `dronelog-usage` (API-bruk i admin) bruker alltid **master-nøkkel** (`DRONELOG_AVISAFE_KEY`), ikke selskapsnøkkel.
- Usage-loggen viser samtidig `remaining: 2384` og en request med `status_code: 429`, som betyr at 429 her er **rate/endpoint-throttle**, ikke nødvendigvis “månedskvote = 0”.
- UI viser i dag alltid melding om “månedskvote nådd” for alle 429-feil, som blir misvisende.

Implementeringsplan:
1) Juster `process-dronelog` til å videresende upstream status korrekt (behold 429, ikke pakk som 502) og inkluder `details`, `upstreamStatus`, `retryAfter`.
2) Utvid `dronelog-usage` med valgfri `companyId`, slå opp `companies.dronelog_api_key`, og hent usage med samme nøkkel som brukes i DJI-flyten.
3) Oppdater admin-visning for API-bruk til å vise hvilket nøkkel-scope som vises (master vs selskap), og default til valgt selskap.
4) Oppdater `UploadDroneLogDialog` feilhåndtering:
   - 429 + `remaining > 0` => “For mange forespørsler nå, prøv igjen om litt”.
   - 429 + `remaining = 0` => “Månedskvote brukt opp”.
   - 401/403 => ugyldig/utløpt API-nøkkel.
5) Legg inn enkel klient-throttle på DJI-login-knappen (debounce/cooldown 10–30s) for å unngå unødige 429 ved gjentatte klikk.
6) Legg til edge-logger med anonymisert nøkkel-fingerprint (f.eks. prefix) og action-navn for raskere feilsøk.

Tekniske detaljer:
- Berørte filer:
  - `supabase/functions/process-dronelog/index.ts`
  - `supabase/functions/dronelog-usage/index.ts`
  - `src/components/UploadDroneLogDialog.tsx`
  - `src/components/admin/CompanyManagementSection.tsx`
- Verifikasjon:
  1. Kjør DJI-login én gang og bekreft 200.
  2. Trigger flere raske kall og bekreft ren 429 med retry-beskjed (ikke “månedskvote nådd”).
  3. Sammenlign “API-bruk” for master vs selskap og bekreft at tall matcher nøkkelen i bruk.
