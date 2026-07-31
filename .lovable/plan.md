## Problem

Når en ny bruker registrerer seg og venter på godkjenning, velger `send-notification-email` (`type: 'notify_admins_new_user'`) mottakere slik:

- Tar den nye brukerens selskap (`companyId`) pluss dets direkte `parent_company_id`.
- Velger admin-profiler **der `profiles.company_id` er én av disse to id-ene**.

Men `profiles.company_id` er ikke en stabil «hjemme-tilhørighet» — `switchCompany()` i `AuthContext` **overskriver** `profiles.company_id` med avdelingen administratoren står i akkurat nå. Den varige tilhørigheten ligger i `user_companies`.

En administrator som egentlig hører til morselskapet (f.eks. Norconsult), men som har byttet til avdeling B, har derfor `profiles.company_id = avdeling B`. Når noen registrerer seg i morselskapet eller i avdeling A, treffer ikke mottaker-spørringen ham, og ingen e-post sendes. Badgen for ventende godkjenninger har samme begrensning.

## Varslingsregler (bekreftet mot data)

Verifisert i databasen: hver administrator har nøyaktig **én** `user_companies`-rad = hjemme-selskapet. Det gir:

- **Avdelingsadministrator** (hjemme i avdelingen): varsles **kun** når noen registrerer seg i egen avdeling. Aldri for morselskapet eller andre avdelinger.
- **Administrator i morselskapet**: varsles for registreringer i morselskapet (`email_new_user_pending`) og for registreringer i underavdelinger (`email_child_new_user_pending`) — uendret fra dagens regelverk.
- Å bytte kontekst (stå i en avdeling) endrer **ikke** hvem man er varslingsansvarlig for; kun hjemme-tilhørigheten teller.

## Fix

1. **Ny security-definer SQL-funksjon** `get_pending_approval_notification_admins(_company_id uuid)`:
   - Returnerer admin-/administrator-brukere basert på `user_companies` (ikke `profiles.company_id`):
     - admins med `user_companies`-rad for `_company_id` → «samme selskap»-mottakere,
     - admins med `user_companies`-rad for **forelderen** til `_company_id` → «parent»-mottakere,
     - fallback til `profiles.company_id` kun for brukere helt uten `user_companies`-rader (eldre kontoer), slik at ingen mister varsler de får i dag.
   - Returnerer `(user_id uuid, is_parent boolean)` slik at edge-funksjonen kan bruke riktig preferanseflagg.
   - Ingen «alle i hierarkiet»-utvidelse: en avdelingsadmin blir aldri returnert for en annen avdeling.

2. **Oppdater `supabase/functions/send-notification-email/index.ts`** (`notify_admins_new_user`):
   - Bytt ut `profiles.company_id`-oppslaget med kall til den nye funksjonen.
   - Behold preferansefiltrering: `email_new_user_pending` for samme selskap, `email_child_new_user_pending` for morselskapets admins.
   - Behold Avisafe-superadmin-invitasjonsgrenen uendret.
   - Dedupliser: kvalifiserer en admin begge veier, sendes én e-post (samme-selskap-preferansen vinner).

3. **Oppdater `src/components/PendingApprovalsBadge.tsx`** slik at badge-tellingen bruker samme regel (hjemme-selskap + eventuelle underavdelinger for morselskapets admins), så badge og e-post er konsistente.

## Teknisk

- Kun mottaker-logikken endres; maler, språkhåndtering og utsending er uberørt.
- Funksjonen er `SECURITY DEFINER` med `set search_path = public`, GRANT EXECUTE til `service_role` (edge function) og `authenticated` (badge).
- Ingen skjemaendringer på eksisterende tabeller, ingen datamigrering.

## Verifisering

- Kjør funksjonen for en avdelings-id og bekreft at kun avdelingens egne admins + morselskapets admins returneres.
- Kjør den for en annen avdelings-id og bekreft at avdeling B sine admins **ikke** er med.
- Trigg edge-funksjonen for en test-bruker og sjekk i loggene at morselskapets admin (som står i en avdeling) får e-post.
