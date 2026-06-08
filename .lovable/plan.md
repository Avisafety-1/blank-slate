## Problem
Ved lagring av FH2 webhook-token får brukeren `Edge Function returned a non-2xx status code` (faktisk 403 `{"error":"forbidden"}`).

Rotårsak: `supabase/functions/flighthub2-airspace-webhook-config/index.ts` aksepterer kun rollene `admin` og `superadmin`:

```ts
if (!roles.includes("admin") && !roles.includes("superadmin")) {
  return ... "forbidden" 403
}
```

Den norske selskapsadministrator-rollen i `app_role`-enumen heter `administrator` (egen verdi, ikke alias for `admin`). Resten av kodebasen tillater eksplisitt alle tre: `["administrator", "admin", "superadmin"]` (se f.eks. `check-document-expiry`, `admin-delete-user`, `weekly-company-report`, `manage-dronelog-key`). Webhook-config-funksjonen har bare blitt glemt.

## Endring
I `supabase/functions/flighthub2-airspace-webhook-config/index.ts`, oppdater rollesjekken til:

```ts
const ADMIN_ROLES = ["administrator", "admin", "superadmin"];
if (!roles.some((r) => ADMIN_ROLES.includes(r))) {
  return forbidden();
}
```

Ingen andre filer trenger endring. Ingen DB-migrasjon, ingen UI-endring.

## Verifisering
1. Deploy `flighthub2-airspace-webhook-config`.
2. Logget inn som `administrator` for UAS Voss, generer ny token, slå på «Aktiver webhook», trykk Lagre → forventer 200, toast «Webhook-konfigurasjon lagret».
3. Sjekk at `flighthub2_webhook_config` for UAS Voss nå har `enabled = true` og oppdatert `token_encrypted`.