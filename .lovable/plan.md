

## Plan: Avdelinger arver selskapssettings fra morselskap

### Problem
Når DJI, ECCAIRS, DroneTag eller auto-sync aktiveres på et morselskap, oppdateres kun morselskapets rad i `companies`-tabellen. Avdelinger har sine egne rader med standardverdier (alt av) og arver ingenting. Edge-funksjonen `dji-auto-sync` spør direkte mot `companies`-tabellen og finner ikke avdelinger som mangler egne flagg.

### Løsning: Kaskade-oppdatering via database-trigger
Opprett en PostgreSQL-trigger på `companies`-tabellen som automatisk propagerer relevante innstillinger til alle barn når et morselskap oppdateres. Dette sikrer at alle eksisterende og fremtidige queries fungerer uten fallback-logikk.

### Steg 1: SQL-migrasjon — kaskade-trigger

Opprett en trigger-funksjon som kjører etter UPDATE på `companies`. Når følgende kolonner endres på et selskap som har barn, oppdateres alle barn automatisk:
- `dji_flightlog_enabled`
- `dji_auto_sync_enabled`
- `dji_sync_from_date`
- `dronelog_api_key`
- `eccairs_enabled`
- `dronetag_enabled`

Triggeren sjekker om selskapet har barn (`parent_company_id = id`) og oppdaterer kun kolonner som faktisk endret seg.

I tillegg: en engangs-UPDATE som synkroniserer eksisterende avdelinger med sine morselskaper nå.

### Steg 2: AuthContext — utvid arv
**Fil: `src/contexts/AuthContext.tsx`**

Legg til `dji_auto_sync_enabled` i parent-company-queryen slik at også denne verdien arves client-side (for UI-visning).

### Steg 3: Admin-UI — vis arvede innstillinger
**Fil: `src/components/admin/CompanyManagementSection.tsx`**

For avdelinger (selskaper med `parent_company_id`): vis integrasjonsbryterne som disabled/låst med en info-tekst «Arvet fra morselskap». Bryterne kan kun endres på morselskapet.

### Filer som endres
- SQL-migrasjon (ny trigger + engangs-sync)
- `src/contexts/AuthContext.tsx` — utvid parent-arv
- `src/components/admin/CompanyManagementSection.tsx` — låste brytere for avdelinger

