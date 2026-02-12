
# Plattformstatistikk (/statistikk)

En dedikert statistikkside som viser aggregerte tall pa tvers av alle selskaper i AviSafe. Kun tilgjengelig for superadmins som er logget inn pa selskapet "Avisafe".

## Tilgangskontroll
- Krever bade `isSuperAdmin` OG at `companyName` matcher "Avisafe" (case-insensitive)
- Brukere som ikke oppfyller begge krav redirectes til dashbordet

## Ekskluder Avisafe-toggle
- En synlig bryter (Switch) oppe pa siden: "Ekskluder Avisafe testdata"
- Nar den er pa, filtreres Avisafe sitt company_id (`a6698b2d-8464-4f88-9bc4-ebcc072f629d`) bort fra all statistikk

## Hva vises

### KPI-kort (overste rad)
- Antall selskaper (aktive)
- Antall brukere (godkjente)
- Totalt antall flyturer
- Total flytid (timer)
- Totalt antall hendelser
- Totalt antall droner
- Totalt antall oppdrag

### Grafer
- **Flyturer per maned** (stolpediagram, siste 12 maneder)
- **Flytid per maned** (linjediagram)
- **Hendelser per maned** (stolpediagram)
- **Nye brukere per maned** (linjediagram)
- **Hendelser per alvorlighetsgrad** (kakediagram)
- **Top 10 selskaper etter flytimer** (horisontalt stolpediagram)
- **Top 10 selskaper etter oppdrag** (horisontalt stolpediagram)
- **Oppdrag per status** (kakediagram)

### Ekstra metrikker
- SafeSky-bruksrate (andel flyturer publisert)
- Sjekkliste-fullforingsrate
- Gjennomsnittlig flytid per flytur
- Hendelsesfrekvens (hendelser per 100 flytimer)

## Teknisk plan

### 1. Ny Edge Function: `platform-statistics`
- Plasseres i `supabase/functions/platform-statistics/index.ts`
- `verify_jwt = true` i config.toml
- Validerer at innlogget bruker er superadmin OG tilhorer Avisafe-selskapet (server-side sjekk)
- Aksepterer query-parameter `exclude_avisafe=true` for a filtrere bort Avisafe-data
- Bruker service_role-nokkel for a omga RLS og kjore aggregerte sporringer mot:
  - `companies` (count aktive)
  - `profiles` (count godkjente, created_at for trend)
  - `flight_logs` (count, sum flight_duration_minutes, flight_date, safesky_mode, completed_checklists)
  - `incidents` (count, alvorlighetsgrad, hendelsestidspunkt)
  - `drones` (count, sum flyvetimer)
  - `missions` (count, status)
- Returnerer ferdig aggregert JSON -- ingen ra-data til klienten

### 2. Ny side: `src/pages/Statistikk.tsx`
- Bygges etter samme monster som `Status.tsx` med GlassCard, Recharts og KPI-kort
- Henter data fra edge function via `supabase.functions.invoke('platform-statistics')`
- "Ekskluder Avisafe"-bryter sender `exclude_avisafe` parameter
- Tidsperiode-velger (siste 6/12 maneder, i ar, egendefinert)
- Eksport til Excel/PDF (gjenbruk monster fra Status.tsx)

### 3. Ruting i `App.tsx`
- Legges til som egen rute: `<Route path="/statistikk" element={<Statistikk />} />`
- Utenfor AuthenticatedLayout (egen header, likt Admin-siden)
- Tilgangskontroll skjer inne i komponenten

### 4. Navigasjon
- Lenke til `/statistikk` legges til i Header, kun synlig nar bruker er superadmin OG tilhorer Avisafe
