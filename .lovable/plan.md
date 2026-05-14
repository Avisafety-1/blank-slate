# Plan: Selskaps-audiences i Resend + fiks av auto-sync

## Mål

1. Opprette egne Resend Audiences for Norconsult og Tensio (i tillegg til den eksisterende globale).
2. Brukere fra disse selskapene skal automatisk havne i sin selskaps-audience – uten å trykke «Synkroniser» manuelt.
3. Bygge mappingen generisk så det er enkelt å skru på flere selskaper senere.

## Diagnose: hvorfor auto-sync aldri har virket

- Trigger `trg_profiles_resend_audience_*` er på plass, men edge-funksjonen `sync-user-to-resend-audience` har **null** invocations, og `net._http_response` har null treff på «audience».
- Trigger-funksjonen leser hemmeligheter fra `vault.decrypted_secrets`. SECURITY DEFINER-eieren har trolig ikke leseaksess der, og feilen svelges av `EXCEPTION WHEN OTHERS`.
- Vi flytter konfig ut av vault og inn i en superadmin-låst tabell `private.app_settings`, så lesing alltid lykkes.

## Endringer

### 1. Database

Ny tabell `public.resend_company_audiences`:
- `company_id` (PK, FK companies)
- `audience_id` (Resend audience id, nullable – lazily opprettet)
- `audience_name` (visningsnavn)
- `enabled` (default true)
- standard timestamps
- RLS: kun superadmin SELECT/INSERT/UPDATE/DELETE

Seed-rader for Norconsult Norge AS og Tensio (begge `enabled=true`, `audience_id=null` – fylles inn ved første synk).

Ny privat config:
- Schema `private` (om ikke finnes), tabell `private.app_settings(key text PK, value text)`
- Setter inn `resend_audience_sync_url` og `resend_audience_sync_secret`
- Ingen RLS – ikke eksponert via PostgREST (privat schema)

Oppdatert trigger-funksjon `sync_profile_to_resend_audience`:
- Leser URL + secret fra `private.app_settings` i stedet for vault
- Inkluderer `user_id` i payload (slik at edge-funksjonen kan slå opp company)
- Beholder fire-and-forget oppførsel

### 2. Edge function `sync-user-to-resend-audience`

- Tar imot `user_id` i payload (i tillegg til dagens felter)
- Slår opp brukerens `company_id` → går opp til rot via eksisterende `get_root_company_id`
- Sjekker `resend_company_audiences` for rotselskapet:
  - Hvis ikke aktiv: gjør kun global synk (som i dag)
  - Hvis aktiv og `audience_id` er null: kaller `POST /audiences` for å opprette, persister id-en
  - Synker brukeren til både global og selskaps-audience (upsert/delete speiles)
- Logger tydelig per audience for debugging

### 3. Edge function `backfill-resend-audience`

- Etter global synk: itererer aktive `resend_company_audiences`, henter brukerne i hierarkiet for hvert rotselskap (samme logikk som over) og kjører samme upsert mot riktig audience
- Returnerer telling per audience i responsen så MarketingSettings kan vise resultatet

### 4. UI: `MarketingSettings.tsx`

- Liten ny seksjon «Selskaps-audiences» i Resend-kortet:
  - Liste over rader fra `resend_company_audiences` med bryter for `enabled` og badge for status (Opprettet / Venter)
  - «Legg til selskap» knapp som åpner enkelt søk i `companies` (kun rotselskap, superadmin) og legger inn rad
- Toast i «Synkroniser nå» viser tall per audience

## Tekniske detaljer

```text
profiles INSERT/UPDATE
   ↓ trigger
sync_profile_to_resend_audience()
   ├─ leser private.app_settings (url + secret)
   └─ http_post → sync-user-to-resend-audience
         ├─ Resend: upsert global audience
         └─ slå opp rot-company → resend_company_audiences
                ├─ lazily POST /audiences om audience_id mangler
                └─ Resend: upsert selskaps-audience
```

Hvorfor ikke segments? Resend har ikke segments på Audience-nivå via API, kun separate Audiences. Mapping-tabellen lar oss skalere uten kodeendring – bare flagg `enabled` på flere selskaper.

## Filer som endres

- migrations: ny tabell + seed + private config + oppdatert trigger-funksjon
- `supabase/functions/sync-user-to-resend-audience/index.ts`
- `supabase/functions/backfill-resend-audience/index.ts`
- `src/components/marketing/MarketingSettings.tsx`
- `mem://integrations/resend-audience-auto-sync` (oppdatere notatet)

## Verifisering

1. Opprett ny testbruker på Norconsult → sjekk `net._http_response` og edge-logger (skal se invocation)
2. Sjekk Resend dashboard: brukeren finnes i både hoved-audience og «Norconsult»
3. Endre brukers e-post → verifiser oppdatering i begge audiences
4. Slett bruker → verifiser fjerning fra begge
5. Trykk «Synkroniser» fra /marketing → toast skal vise tall per audience