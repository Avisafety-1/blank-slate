## Mål
Godkjennere skal få **SMS** (i tillegg til e-post) når et oppdrag ligger til godkjenning og det er **mindre enn 12 timer** igjen til oppdragets start.

To triggere:
1. **Umiddelbart ved innsending til godkjenning** — hvis `tidspunkt - now < 12t` → send SMS med en gang.
2. **Fra påminnelses-cron** — så lenge oppdraget fortsatt er `pending_approval` og det er <12t til start (eller allerede startet innenfor tier 4-vinduet).

SMS sendes kun til godkjennere som allerede regnes som mottakere for godkjennings-e-post (samme filter: `can_approve_missions`, `approval_company_ids`, `prevent_self_approval`, `notification_preferences.email_mission_approval = true`, og som har `profiles.telefon`). Vi legger ikke til egen SMS-preferanse i denne omgang (kan komme senere).

## Endringer

### 1. `supabase/functions/send-notification-email/index.ts` — `notify_mission_approval`-handleren
Etter at e-post er sendt til godkjennere, sjekk `hoursUntil = (tidspunkt - now)/3600s`. Hvis `hoursUntil < 12` (inkludert negative verdier), send SMS via GatewayAPI til hver godkjenner som har `telefon`. Bruk samme mønster som `check-long-flights` (`normalizeMsisdn`, `LOVABLE_API_KEY` + `GATEWAYAPI_API_KEY`, `sender: 'AviSafe'`, `reference: approval-<missionId>-<userId>`). Meldingstekst basert på mottakerens `preferred_language`:
- NO: `AviSafe: Oppdrag «<tittel>» venter på din godkjenning. Start <dato tid> (om X t). Logg inn for å godkjenne.`
- EN: `AviSafe: Mission "<title>" is awaiting your approval. Starts <date time> (in X h). Log in to approve.`

Hent `telefon, preferred_language` sammen med `id, approval_company_ids, company_id` i den eksisterende `approverProfiles`-spørringen så vi ikke trenger nye rundturer.

### 2. `supabase/functions/check-mission-approval-reminders/index.ts` — påminnelses-cron
Utvid til også å sende SMS når `hoursUntil < 12` (dvs. tier 2 med rest <12t, tier 3, tier 4). Bruk samme mottakerliste (`notifyIds`) og samme meldingstekst-mal som over. Bruk `mission_approval_reminders.recipients_count` som i dag; SMS-status logges via `console.log` (ingen egen tabell).

For å unngå dobbeltsending av SMS legger vi til én kolonne `sms_recipients_count` (default 0) på `mission_approval_reminders`, og hopper over SMS på (mission_id, tier)-nivå hvis en tidligere kjøring allerede har sendt SMS for samme tier. Umiddelbar SMS fra `send-notification-email` regnes som tier-uavhengig og vil naturlig ikke gjentas siden mission bare sendes én gang.

### 3. Database-migrasjon
```sql
ALTER TABLE public.mission_approval_reminders
  ADD COLUMN IF NOT EXISTS sms_recipients_count int NOT NULL DEFAULT 0;
```

## Ute av scope
- Ingen ny UI-innstilling for SMS-preferanser (SMS følger e-post-preferansen for godkjenning).
- Ingen endring i norsk/eksisterende reminder-tier-logikk utover SMS-tillegget.
- Personell-varsel (tier 3 til pilot) forblir e-post kun.

## Verifikasjon
- Sette en test-godkjenner med `telefon = +4748182991`, opprette oppdrag med start om 6 timer, sende til godkjenning → sjekke at både e-post og SMS kommer.
- Kjøre `check-mission-approval-reminders` manuelt med et pending-oppdrag om <12t → SMS sendes én gang per tier.
