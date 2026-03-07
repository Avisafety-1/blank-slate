

## Plan: Superadmin-kontroll for sync-startdato per selskap

### Hva
Legg til et datofelt i selskapsadministrasjonen (CompanyManagementSection) der superadmin kan sette `dji_sync_from_date` — den tidligste datoen et selskap kan synce DJI-logger fra. Kolonnen finnes allerede i databasen, så ingen migrasjon trengs.

### Endringer

**`src/components/admin/CompanyManagementSection.tsx`**
1. Legg til `dji_sync_from_date` i Company-interface og i fetch-queryen
2. Ved siden av auto-sync-bryteren (eller som en ny kolonne/rad), vis en datepicker (Popover + Calendar) for `dji_sync_from_date` — kun synlig når `dji_flightlog_enabled` er true
3. Ved endring: oppdater `companies.dji_sync_from_date` via supabase og vis toast
4. Vis gjeldende dato som tekst med en "Endre"-knapp, eller en inline kalender-popover

### Flyt
- Superadmin åpner selskapsadministrasjonen
- For selskaper med DJI aktivert, vises en "Sync fra dato"-kolonne med gjeldende dato
- Klikk åpner en kalender-popover der superadmin velger ny dato
- Dato lagres umiddelbart, og neste auto-sync vil kun hente logger fra denne datoen og fremover

### Ingen backend-endring nødvendig
`dji_sync_from_date` eksisterer allerede i `companies`-tabellen og brukes allerede av `dji-auto-sync` edge-funksjonen for filtrering og auto-advancing.

