

# DJI Flylogg-opplasting: Per-selskap aktivering med egen API-nøkkel

## Oversikt

I dag er DJI flylogg-opplasting hardkodet til å bare vises for selskaper med navn som inneholder "avisafe" eller "uas voss", og alle bruker samme globale `DRONELOG_AVISAFE_KEY`. Denne endringen gjør at superadmin kan aktivere/deaktivere DJI-opplasting per selskap via en bryter i admin-panelet. Når bryteren slås på, genereres en dedikert DroneLog API-nøkkel for selskapet og lagres i databasen.

## Tekniske endringer

### 1. Database-migrasjon

Legg til to nye kolonner på `companies`-tabellen:

```sql
ALTER TABLE companies
  ADD COLUMN dji_flightlog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN dronelog_api_key text;
```

### 2. Ny edge function: `manage-dronelog-key`

Oppretter/sletter DroneLog API-nøkler via DroneLog API:

- **Aktivering**: Kaller `POST https://dronelogapi.com/api/v1/keys` med `{ name: "<selskapsnavn>" }` og `Authorization: Bearer <master-key>`. Lagrer den returnerte nøkkelen i `companies.dronelog_api_key` og setter `dji_flightlog_enabled = true`.
- **Deaktivering**: Kaller `DELETE https://dronelogapi.com/api/v1/keys/<key>` for å slette nøkkelen fra DroneLog, nullstiller `dronelog_api_key` og setter `dji_flightlog_enabled = false`.
- Bruker den eksisterende `DRONELOG_AVISAFE_KEY` som master-nøkkel for å opprette nye nøkler.

### 3. Admin UI: CompanyManagementSection

Legg til en ny "DJI"-bryter (Switch) ved siden av ECCAIRS-bryteren, både i desktop-tabellen og mobil-kortene. Følger nøyaktig samme mønster som `handleToggleEccairs`:

- Optimistisk UI-oppdatering
- Kaller edge function `manage-dronelog-key` med `{ companyId, enable: true/false }`
- Toast-melding med suksess/feil

Kolonne-header i tabellen: "DJI Flylogg". Badge viser "På"/"Av".

### 4. Oppdater `process-dronelog` edge function

I stedet for å alltid bruke `DRONELOG_AVISAFE_KEY`, hent brukerens `company_id` fra profilen, slå opp `dronelog_api_key` fra `companies`-tabellen, og bruk den selskapsspesifikke nøkkelen. Fallback til `DRONELOG_AVISAFE_KEY` hvis ingen selskapsnøkkel finnes.

### 5. Fjern hardkodet selskapssjekk i Index.tsx

Erstatt sjekken `companyName?.toLowerCase().includes('avisafe') || companyName?.toLowerCase().includes('uas voss')` med en sjekk mot `dji_flightlog_enabled` fra selskapsdataene. Hent denne verdien via AuthContext eller en dedikert query.

## Filer som endres

| Fil | Endring |
|---|---|
| `supabase/migrations/` | Ny migrasjon: legg til `dji_flightlog_enabled` og `dronelog_api_key` på `companies` |
| `supabase/functions/manage-dronelog-key/index.ts` | Ny edge function for å opprette/slette DroneLog API-nøkler |
| `supabase/config.toml` | Registrer ny funksjon med `verify_jwt = false` |
| `src/components/admin/CompanyManagementSection.tsx` | Legg til DJI-bryter i tabell og mobil-kort |
| `supabase/functions/process-dronelog/index.ts` | Bruk selskapsspesifikk nøkkel i stedet for global |
| `src/pages/Index.tsx` | Erstatt hardkodet selskapssjekk med `dji_flightlog_enabled` |
| `src/contexts/AuthContext.tsx` | Eksponer `djiFlightlogEnabled` fra selskapsdataene |

## Flyten

```text
Admin slår på DJI-bryter for "Firma AS"
  → Frontend kaller manage-dronelog-key({ companyId, enable: true })
  → Edge function: POST dronelogapi.com/api/v1/keys { name: "Firma AS" }
  → Returnert nøkkel lagres i companies.dronelog_api_key
  → companies.dji_flightlog_enabled = true
  → UI oppdateres

Pilot i "Firma AS" laster opp flylogg
  → process-dronelog henter company.dronelog_api_key
  → Bruker selskapets egen nøkkel mot DroneLog API
```

