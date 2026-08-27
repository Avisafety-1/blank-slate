# Egendefinerte varsler: aktiv flytur og oppdragsstart

## Mål

1. Brukeren velger selv hvor lenge en flytur skal ha pågått før varsel sendes (i dag fast 3 timer).
2. Ny varseltype: påminnelse før et oppdrag starter, med valgfri kanal (e-post, SMS eller begge) og valgfri tid før start.
   Tekst: "Ditt oppdrag {navn} starter om {x} minutter. Husk å starte det i AviSafe".

## Slik blir det for brukeren

I Profil → Varslingsinnstillinger kommer to nye seksjoner:

**Aktiv flytur**
- Av/på for e-post og for SMS
- Felt: "Varsle etter" (timer, 1–12, standard 3)

**Før oppdrag starter**
- Av/på for e-post og for SMS
- Felt: "Varsle før start" (minutter, 5–1440, standard 30)
- Varselet bruker oppdragets starttidspunkt, sendes én gang per oppdrag per bruker, og kun til personell som er tildelt oppdraget.

Eksisterende push-påminnelse for oppdrag (timer før) beholdes uendret.

## Teknisk

**Database (migrasjon på `notification_preferences`)**
- `long_flight_alert_hours int not null default 3`
- `long_flight_email boolean not null default true`
- `long_flight_sms boolean not null default true`
- `mission_start_alert_minutes int not null default 30`
- `mission_start_alert_email boolean not null default false`
- `mission_start_alert_sms boolean not null default false`
- Ny tabell `mission_start_alert_sends (mission_id, user_id, sent_at)` med unik nøkkel `(mission_id, user_id)` for å hindre dobbeltvarsling. GRANT til `service_role`, RLS på med kun egen-lesing for `authenticated`.

**`check-long-flights`**
- Hent alle aktive flyginger uten `long_flight_notified_at` i stedet for fast 3-timers filter, og sammenlign varigheten mot brukerens `long_flight_alert_hours` (fall tilbake til 3 hvis rad mangler).
- Respekter `long_flight_email` / `long_flight_sms`; push beholdes som i dag.
- Kjøres allerede hvert 15. minutt — ingen cron-endring.

**Ny funksjon `check-mission-start-alerts`**
- Cron hvert 5. minutt (`pg_cron` + `pg_net`, cron-secret-header som øvrige jobber).
- Henter oppdrag med status `Planlagt`/`Tildelt` og `tidspunkt` innenfor neste 24 t, med `mission_personnel`.
- For hver tildelt bruker: send hvis `tidspunkt - now <= mission_start_alert_minutes` og ingen rad i `mission_start_alert_sends`.
- Sender e-post via `_shared/resend-email.ts` + `getEmailConfig(company_id)` og SMS via `_shared/sms.ts` (`sendGatewaySms`), i norsk/engelsk etter `profiles.preferred_language`.
- Logger sending i `mission_start_alert_sends`.

**Frontend**
- `src/components/ProfileDialog.tsx`: nye brytere og tallfelt i varslingsfanen, samme lagringsmønster som `updateNotificationPref` og `missionReminderHoursDraft` (validering ved blur).
- Alle nye tekster som `t()`-nøkler i både `no.json` og `en.json`.

## Utenfor omfang

Ingen endringer i eksisterende push-varsler, andre varseltyper, RLS på andre tabeller eller SMS-oppsettet i seg selv.
