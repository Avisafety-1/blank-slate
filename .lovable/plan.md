

## Per-bruker DJI auto-sync

### Nåværende situasjon
- `dji_auto_sync_enabled` er en **selskapsinnstilling** (companies-tabellen), satt av superadmin
- Når auto-sync (cron) kjører, synces **alle brukere** med DJI-credentials i selskapet
- «Sync nå»-knappen sender `{ companyId }` — edge-funksjonen ignorerer dette og syncer alle selskaper
- Per-bruker «enableAutoSync»-checkbox i UploadDroneLogDialog setter `companies.dji_auto_sync_enabled` (selskaps-nivå), ikke per bruker
- `dji_credentials`-tabellen har **ingen** `auto_sync_enabled`-kolonne

### Ønsket oppførsel
- `companies.dji_auto_sync_enabled` er en master switch satt av superadmin — bestemmer om auto-sync er tilgjengelig for selskapet
- Hver bruker velger selv om **sin** DJI-konto skal auto-synces (per-bruker toggle)
- Auto-sync (cron) syncer kun brukere som har `auto_sync_enabled = true` på sine credentials
- «Sync nå» syncer kun den innloggede brukerens DJI-konto

### Endringer

**1. Database migration**
```sql
ALTER TABLE dji_credentials 
  ADD COLUMN auto_sync_enabled boolean DEFAULT false;
```

**2. Edge function — `supabase/functions/dji-auto-sync/index.ts`**
- Parse `userId` fra request body
- **Manuell sync** (userId satt): Hent brukerens profil → selskap → credentials kun for den brukeren → sync
- **Auto-sync/cron** (ingen userId): Behold selskaps-query (`dji_auto_sync_enabled = true`), men filtrer credentials med `.eq("auto_sync_enabled", true)` slik at kun brukere som har skrudd på auto-sync synces

**3. Frontend — `src/components/UploadDroneLogDialog.tsx`**
- «Sync nå»: Send `{ companyId, userId: user.id }` i stedet for bare `{ companyId }`
- enableAutoSync-checkbox: Oppdater `dji_credentials.auto_sync_enabled` for brukerens rad (ikke `companies.dji_auto_sync_enabled`)
- Vis auto-sync toggle kun når `companies.dji_auto_sync_enabled = true` (master switch)

### Teknisk flyt

```text
Manuell sync (Sync nå):
  Body: { companyId, userId }
  → Hent company (dronelog_api_key, dji_sync_from_date)
  → Hent dji_credentials WHERE user_id = userId
  → Sync kun denne brukeren

Auto-sync (cron):
  Body: {}
  → Hent companies WHERE dji_auto_sync_enabled = true
  → For hvert selskap:
      → Hent dji_credentials WHERE auto_sync_enabled = true
      → Sync kun brukere som har skrudd på auto-sync
```

