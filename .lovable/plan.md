# Auto-synk brukere → Resend Audience

Mål: Alle brukere (`profiles.email`) i systemet skal automatisk speiles til Resend Audience (`RESEND_AUDIENCE_ID`), slik at audience alltid er oppdatert uten manuell vedlikehold.

## Hvordan det skal fungere

1. **Ved ny bruker** → legges til i Resend Audience.
2. **Ved e-post endring** → oppdateres (gammel slettes, ny opprettes).
3. **Ved sletting av bruker** → fjernes fra Resend Audience.
4. **Backfill** → alle eksisterende 47 profiler synkes én gang.
5. **Opt-out respekteres** → hvis bruker står som `unsubscribed` i Resend (manuelt avmeldt), gjenopprettes ikke abonnementet automatisk.

## Teknisk

### Ny edge function: `sync-user-to-resend-audience`
- Tar `{ action: 'upsert' | 'delete', email, first_name?, last_name?, old_email? }`
- Bruker `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` (allerede konfigurert).
- `upsert`: POST `/audiences/{id}/contacts` (Resend håndterer duplikater idempotent — 200 hvis finnes).
- `delete`: DELETE `/audiences/{id}/contacts/{email}` (Resend støtter sletting på e-post).
- Logger feil, returnerer 200 selv ved enkeltfeil for ikke å blokkere triggere.

### Database trigger på `public.profiles`
Bruker `pg_net` (allerede aktivert via eksisterende cron-jobber) for asynkrone HTTP-kall:
- `AFTER INSERT` → kall edge function med `action='upsert'` hvis email er satt.
- `AFTER UPDATE` på `email` → kall med `action='upsert'` (ny) + `delete` (gammel hvis endret).
- `AFTER DELETE` → kall med `action='delete'`.

Trigger-funksjonen er `SECURITY DEFINER` og leser `service_role_key` fra Vault (samme mønster som `process-email-queue`).

### Ny edge function: `backfill-resend-audience`
- Krever superadmin-auth.
- Henter alle `profiles.email` (47 stk) og synker batch-vis (delay 200ms for å unngå rate-limit).
- Returnerer summering `{ added, skipped, failed }`.
- Knapp legges i `MarketingSettings.tsx` under "Plattformintegrasjoner" → "Synkroniser alle brukere til Resend nå".

### Status-indikator
Liten badge i `MarketingSettings.tsx`:
- Viser "Auto-synk aktiv" når trigger er installert.
- Lenke til Resend Audience i dashbord.

## Filer som endres / opprettes

- `supabase/functions/sync-user-to-resend-audience/index.ts` (ny)
- `supabase/functions/backfill-resend-audience/index.ts` (ny)
- Migrasjon: trigger-funksjon + 3 triggere på `profiles`
- `src/components/marketing/MarketingSettings.tsx` (legg til backfill-knapp + status)

## Spørsmål før implementering

1. Skal **alle** brukere synkes, eller kun de med `approved = true`?
2. Skal vi respektere et eget opt-out felt (f.eks. ny kolonne `newsletter_opt_out`), eller stole kun på Resend sitt `unsubscribed`-flagg (anbefalt — én sannhetskilde)?
