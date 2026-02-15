

## Aktivitetslogg for plattformstatistikk

### Oversikt
Legge til en aktivitetslogg oeverst pa Statistikk-siden som viser de siste hendelsene pa tvers av alle selskaper. Loggen viser hva som skjedde, hvem som gjorde det (navn og firma), og nar.

### Aktivitetstyper som spores
- Nytt oppdrag (missions)
- Risikovurdering (mission_risk_assessments)
- Ny hendelse (incidents)
- Opplastet dokument (documents)
- Ny bruker (profiles)
- Ny drone (drones)
- Nytt utstyr (equipment)

### Sikkerhet
Kun tilgjengelig for superadmins i Avisafe-selskapet (samme tilgangssjekk som eksisterende statistikk-endepunkt).

---

### Teknisk plan

**1. Ny edge function: `supabase/functions/platform-activity-log/index.ts`**

- Gjenbruker samme autorisasjonslogikk som `platform-statistics` (superadmin + Avisafe-sjekk)
- Bruker service role client for a hente data pa tvers av alle selskaper (RLS bypass)
- Kjoerer 7 separate queries mot tabellene og merger resultatene:
  - `missions` (opprettet_dato, user_id, tittel, company_id)
  - `mission_risk_assessments` (created_at, pilot_id, mission_id, company_id)
  - `incidents` (opprettet_dato, user_id, tittel, company_id)
  - `documents` (opprettet_dato, user_id, tittel, company_id)
  - `profiles` (created_at, full_name, company_id)
  - `drones` (opprettet_dato, user_id, modell, company_id)
  - `equipment` (opprettet_dato, user_id, navn, company_id)
- For hver rad hentes brukerens `full_name` fra `profiles` og selskapets `navn` fra `companies`
- Alle resultater sorteres etter tidsstempel (nyeste foerst), begrenset til de siste 50 hendelsene
- Stotter `?limit=N` query-parameter (default 50, maks 200)
- Stotter `?exclude_avisafe=true` for a filtrere bort Avisafe-aktivitet

**2. Ny komponent: `src/components/admin/PlatformActivityLog.tsx`**

- Henter data fra `/platform-activity-log` edge function
- Viser en tabell med kolonner: Type (ikon + tekst), Beskrivelse, Person, Selskap, Tidspunkt
- Hver aktivitetstype far sitt eget ikon og fargekode:
  - Oppdrag: Target (bla)
  - Risikovurdering: Shield (lilla)
  - Hendelse: AlertTriangle (roed)
  - Dokument: FileText (groen)
  - Ny bruker: UserPlus (bla)
  - Drone: Package (oransje)
  - Utstyr: Wrench (gra)
- Tidsstempel formateres relativt ("2 min siden", "1 time siden") med fullt tidsstempel i tooltip
- "Vis mer"-knapp for a laste flere hendelser
- Respekterer "Ekskluder Avisafe"-bryteren

**3. Endring: `src/pages/Statistikk.tsx`**

- Importerer og plasserer `PlatformActivityLog` oeverst, mellom header og KPI-kortene
- Sender `excludeAvisafe`-state som prop til komponenten

### Dataflyt

```text
Statistikk.tsx
  |
  +-- PlatformActivityLog (excludeAvisafe)
  |     |
  |     +-- fetch /platform-activity-log?exclude_avisafe=true&limit=50
  |           |
  |           +-- Edge function (service role)
  |                 +-- Query 7 tabeller
  |                 +-- Join profiles + companies for navn
  |                 +-- Sort + limit
  |                 +-- Return JSON array
  |
  +-- KPI Cards (eksisterende)
  +-- Charts (eksisterende)
```

