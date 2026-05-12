## Mål

I tillegg til eskalerende påminnelse til godkjennere, varsle **personell som er tildelt oppdraget** ved T-4t (trinn 3) om at oppdraget fortsatt ikke er godkjent — med liste over hvem som kan godkjenne, slik at de eventuelt kan ta direkte kontakt.

## Endringer

### 1. Utvid `check-mission-approval-reminders`
Når trinn 3 (≤ 4t igjen) prosesseres for et oppdrag, i tillegg til dagens utsendelse til godkjennere/admin:

- Hent alle `mission_personnel.profile_id` for oppdraget
- Slå opp epost via `auth.admin.getUserById` (samme mønster som i dag)
- Bygg liste over godkjennere (navn + epost) basert på `eligibleApprovers` som allerede er beregnet
- Send egen epost-mal `mission_pending_approval_personnel` til hver tildelte person
- Respekter `notification_preferences.email_mission_approval` (gjenbruk samme flagg — unngår ny preferansekolonne)
- Ekskluder personell som ikke har en epost / ikke er aktiv bruker

Idempotens: vi gjenbruker eksisterende `mission_approval_reminders`-rad for trinn 3 — den dekker nå "alle utsendelser for trinn 3" (godkjennere + personell). Ingen ny tabell.

### 2. Ny epost-mal `mission_pending_approval_personnel`
Variabler tilgjengelig for `getEmailTemplateWithFallback`:
- `mission_title`, `mission_location`, `mission_date`
- `company_name`
- `approvers_list` (HTML-formatert: `Navn (epost@...)`, separert med `<br>`)
- `hours_until` (formatert tekst)

Inline fallback (samme mønster som resten av filen):

> Emne: `Ditt oppdrag «{tittel}» er ikke godkjent ennå`
>
> "Hei! Vi ser at ditt oppdrag **{tittel}** ({tidspunkt}, {lokasjon}) ennå ikke er godkjent. Vi har sendt påminnelse til:
> {approvers_list}
> Ta eventuelt direkte kontakt for å få oppdraget godkjent før start."

### 3. Ingen migrasjoner nødvendig
- Bruker eksisterende `mission_personnel`, `profiles`, `notification_preferences`, `mission_approval_reminders`-tabeller
- Bruker eksisterende `email_mission_approval`-flagg

## Tekniske detaljer

- Personell-utsendelsen skjer kun på trinn 3. Trinn 1, 2, 4 forblir uendret (kun godkjennere/admin).
- Hvis det ikke finnes godkjennere (`eligibleApprovers.length === 0`), faller `approvers_list` tilbake til "selskapets administrator".
- Hvis personell-listen er tom, hopper vi over personell-blokken stille (oppdraget kan ikke ha pilot ennå).
- Antall sendte eposter for personell legges til samme totalteller (`totalEmails`) — `recipients_count` i sporingstabellen reflekterer godkjenner-antall (uendret semantikk).

## Spørsmål

1. Skal personell-mailen sendes også på trinn 4 (etter starttidspunkt) — nyttig hvis oppdraget faktisk har startet uten godkjenning? Forslag: ja, samme mal med justert tone ("oppdraget er allerede startet"). Kan også droppes hvis det blir for støyete.
2. Skal `approvers_list` vise epost (slik forslaget ditt antyder), eller kun navn + telefon hvis tilgjengelig fra `profiles`?