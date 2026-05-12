## Mål

Sørge for at oppdrag som ligger i `pending_approval` ikke "blir glemt" — sende eskalerende epost-påminnelser til godkjennere basert på hvor nært oppdragstidspunktet (`tidspunkt`) er.

## Eskaleringstrinn

Trinn utløses kun hvis oppdraget fortsatt har `approval_status = 'pending_approval'` ved sjekk-tidspunkt:

| Trinn | Når | Tone | Mottakere |
|---|---|---|---|
| 1 | T-72t (≤ 72t igjen til oppdragsstart) | Vennlig påminnelse | Godkjennere (samme som ved første "send til godkjenning") |
| 2 | T-24t | Tydelig "haster" | Godkjennere |
| 3 | T-4t | Kritisk "siste varsel" | Godkjennere + cc til selskapsadmin(er) |
| Etter start | T+0 | Eskalering: "Oppdrag startet uten godkjenning" | Godkjennere + alle admin |

Hver mottaker får hvert trinn maks én gang per oppdrag (idempotent).

## Endringer

### 1. Ny tabell `mission_approval_reminders`
Sporing for å unngå duplikater.
- `mission_id` (fk)
- `tier` (smallint: 1-4)
- `sent_at`
- Unique på `(mission_id, tier)`
- RLS: kun service role / admins lese

### 2. Ny edge function `check-mission-approval-reminders`
- Beskyttet med `requireCronSecret` (samme mønster som `check-mission-reminders`)
- Henter alle `missions` med `approval_status = 'pending_approval'` og `tidspunkt` innen neste 72t (eller startet for ≤ 24t siden, for trinn 4)
- For hvert oppdrag:
  - Beregn hvilket trinn som er aktivt basert på timer til/fra `tidspunkt`
  - Sjekk `mission_approval_reminders` — hopp over hvis trinnet allerede sendt
  - Hent kvalifiserte godkjennere (samme logikk som dagens `notify_mission_approval`-blokk i `send-notification-email`)
  - For trinn 3 og 4: legg til selskapets admins (rolle `admin`) som ikke allerede er godkjenner
  - Filtrer på `notification_preferences.email_mission_approval = true`
  - Kall `send-notification-email` med ny `type: 'mission_approval_reminder'` (eller utvid eksisterende blokk med `tier`)
  - Logg rad i `mission_approval_reminders`

### 3. Ny epost-template `mission_approval_reminder`
Re-bruker `getEmailTemplateWithFallback` med variabler:
- `mission_title`, `mission_location`, `mission_date`, `mission_description`, `company_name`
- `tier_label` (f.eks. "Påminnelse", "Haster", "Siste varsel", "Kritisk – oppdraget har startet")
- `hours_until` (formatert tekst)

Inline fallback i edge-funksjonen hvis template mangler (samme mønster som dagens kode).

### 4. Cron-job
Ny `pg_cron`-job som kaller `check-mission-approval-reminders` hver 15. minutt (gir god granularitet uten støy). Bruker `cron_secret` Vault-mønsteret som eksisterer.

### 5. Notifikasjonspreferanser
Bruker eksisterende `email_mission_approval`-flagg — ingen ny kolonne nødvendig. (Hvis ønskelig kan vi legge til separat `email_mission_approval_reminders`, men anbefaler å gjenbruke for å unngå konfigurasjonskaos.)

## Tekniske detaljer

- Tidsvinduer beregnes serverside (UTC). Trinn matches innen toleranse: trinn 1 utløses når `hoursUntil <= 72 && > 24`, trinn 2 `<= 24 && > 4`, trinn 3 `<= 4 && > 0`, trinn 4 `<= 0 && >= -24`.
- Avbrytes automatisk så snart `approval_status` endres bort fra `pending_approval` (ingen ekstra sletting nødvendig — neste cron hopper bare over).
- Hvis oppdraget settes til `pending_approval` < 4t før start: trinn 1 og 2 markeres som "skipped" (logges som sendt for å hoppe over) slik at vi går rett til riktig trinn uten å spamme tilbake i tid.

## Spørsmål før implementering

1. Stemmer trinn-tidspunktene (72t / 24t / 4t / etter start), eller ønsker du andre intervaller?
2. Skal trinn 3+4 også gå til selskapets admin-rolle (selv om de ikke er godkjennere), eller kun til de med `can_approve_missions`?
3. Skal vi respektere `prevent_self_approval` også her (filtrere bort godkjennere som er tildelt oppdraget)? Antar ja, samme logikk som i dag.