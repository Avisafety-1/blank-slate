## Funn

Ja, årsaken er sannsynligvis at togglen prøver å oppdatere `dji_credentials` direkte fra frontend:

```ts
supabase.from("dji_credentials").update({ auto_sync_enabled: checked })
```

Men RLS-policyene på `dji_credentials` tillater kun `SELECT` og `DELETE` for egne rader. Det finnes ingen `UPDATE`-policy. Dermed kan UI-en se ut som den endres optimistisk, men databaseoppdateringen blir ikke lagret. Når dialogen åpnes på nytt, leses den gamle verdien fra databasen og togglen hopper tilbake.

## Plan

### 1. Flytt toggle-lagring til eksisterende edge-funksjon
Legg til en ny action i `supabase/functions/process-dronelog/index.ts`, for eksempel:

```text
dji-update-auto-sync
```

Den skal:
- validere innlogget bruker via eksisterende auth-oppsett i funksjonen
- ta imot `autoSyncEnabled: boolean`
- oppdatere kun raden der `user_id = authUser.id`
- bruke service client internt, slik de andre credential-operasjonene allerede gjør
- returnere tydelig feil hvis raden ikke finnes

Dette unngår å åpne en generell `UPDATE`-policy på en tabell som inneholder krypterte DJI-credentials.

### 2. Oppdater frontend-handleren
Endre `handleAutoSyncToggle()` i `src/components/UploadDroneLogDialog.tsx` slik at den kaller:

```ts
callDronelogAction("dji-update-auto-sync", { autoSyncEnabled: checked })
```

i stedet for direkte `supabase.from("dji_credentials").update(...)`.

Behold dagens optimistiske UI:
- toggle endres umiddelbart
- rollback ved feil
- toast ved suksess/feil

### 3. Rydd opp i statuslasting ved åpning
Juster åpningssekvensen slik at `resetState()` ikke kan overstyre eller skape race mot `checkSavedCredentials()`.

Konkret:
- behold `enableAutoSync` uten reset ved vanlig dialog-reset
- sett `enableAutoSync(false)` kun ved faktisk DJI-logg-ut eller når ingen credentials finnes
- la `checkSavedCredentials()` være autoritativ kilde når dialogen åpnes

### 4. Ekstra robusthet
Etter vellykket toggle kan vi eventuelt kalle `checkSavedCredentials()` på nytt, eller la optimistisk state stå. Jeg anbefaler å la optimistisk state stå for rask UI, men legge inn bedre feillogging hvis edge-funksjonen returnerer feil.

## Filer som endres

- `src/components/UploadDroneLogDialog.tsx`
- `supabase/functions/process-dronelog/index.ts`

## Resultat

- Auto-sync-toggle lagres stabilt i databasen.
- Når du lukker og åpner dialogen igjen, vises samme status som du valgte.
- Vi unngår å gi frontend generell skriveadgang til credential-tabellen.