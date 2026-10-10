# Internrevisjon runde B2: varsling og fristpåminnelser

Compliance-motoren, `send-reminder` og eksisterende purringer endres ikke.

## Steg 0 – SQL (vises i chatten, kjøres først etter et eget godkjenningssvar)
Jeg viser full migrasjon og full test-SQL og stopper deretter.

**Migrasjon (idempotent)**
- `audit_notification_log`: id, finding_id (cascade), action_id (null, cascade), kind, recipient_id, sent_at. Unik indeks på (finding_id, coalesce(action_id, nil-uuid), kind, recipient_id). Tilgangsregler er slått på, uten policyer. GRANT gis bare til service_role.
- `notification_preferences.email_audit_tasks boolean NOT NULL DEFAULT true` (`ADD COLUMN IF NOT EXISTS`).
- `cron.unschedule` hvis jobben finnes, deretter `cron.schedule('audit-deadline-reminders', '0 5 * * *', …)`. Den bruker `net.http_post` til funksjons-URL-en med headeren `x-cron-secret`, og verdien hentes ved kjøring med `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'audit_cron_secret')`. Hemmeligheten står ikke i migrasjonen eller i repoet.
- Ingen nye triggere eller funksjoner trengs. Hvis det likevel blir nødvendig, får feilmeldingene `AUDIT_*`-prefiks.

**Test-SQL** (bare `navn = 'Moderavdeling'`, ellers `RAISE EXCEPTION 'Testoppsett: …'`; slutter med `RAISE EXCEPTION 'TESTRESULTAT: %', out;` uten ytre handler):
1. Samme logglinje to ganger avvises av den unike indeksen, både med og uten action_id.
2. Ulik mottaker for samme funn og type godtas.
3. En ny `notification_preferences`-rad får `email_audit_tasks = true`.

**Hemmeligheten:** Jeg lager den med `generate_secret` som `AUDIT_CRON_SECRET` til funksjonen. Verdien kan ikke vises etterpå, og den samme verdien må også ligge i Vault. Derfor ber jeg deg i stedet lage én tilfeldig verdi og legge den inn to steder:
1. Under Project Settings → Secrets som `AUDIT_CRON_SECRET`.
2. I Supabase SQL Editor: `select vault.create_secret('<verdi>', 'audit_cron_secret');`

## Steg 1 – Felles logikk `_shared/auditNotify.ts` (ren modul)
- `getAuditReminderConfig(companyId)` gir `{ soonDays: 7, overdueAfterDays: 1 }`. All fristlogikk går gjennom denne.
- `deadlineEvent(deadline, today, cfg)` bruker tidsvinduer:
  - `deadline_soon` når 0 < (frist − i dag) ≤ soonDays.
  - `deadline_overdue` når (i dag − frist) ≥ overdueAfterDays.
  - Ellers gir den ingenting.
  
  Loggen sikrer at hver type sendes bare én gang per element og mottaker. Dermed får også elementer med kortere frist enn soonDays en påminnelse, og ingen påminnelser går tapt hvis cron-jobben feiler en dag.
- `recipientsFor(event, state, actorId)` bruker databasetilstand: ansvarlige for funn og tiltak, revisjonens ansvarlige og administratorer i eierselskapet. Den som utførte handlingen, fjernes alltid fra mottakerne, og mottakerlisten er uten duplikater. Reglene a–e følger kravene dine (forfalt Nivå 1-funn varsler også revisjonens ansvarlige).
- `deadlineTargets(finding, actions, today, cfg)` hindrer doble fristpåminnelser:
  - Fristpåminnelser for selve funnet sendes bare når funnet ikke har noen åpne tiltak (tiltaksplan mangler). Ellers sendes de bare per åpent tiltak.
  - Unntak: Et forfalt Nivå 1-funn varsler alltid revisjonens ansvarlige én gang, uavhengig av tiltak.
- `buildAuditMessage(event, ctx, lang)` gir emne og brødtekst på nb/en med revisjonstittel, kort beskrivelse, nivå («Nivå 1 / Nivå 2 / Observasjon» / «Level 1 / Level 2 / Observation») og frist.
- `auditFindingKey(kind, entity, id)` gir for eksempel `AuditDeadlineSoon:audit_action:<id>`. Lenken er `/?auditFinding=<finding_id>`, i samme format som `auditDeepLink`, som appen re-eksporterer.
- I `reminderActions` får `Audit*`-kodene ingen hurtighandlinger, bare «Åpne». En test sjekker dette.

## Steg 2 – Felles levering `_shared/auditDeliver.ts`
- For hver mottaker sjekkes først om varselet allerede er logget. Først når loggraden er satt inn (konflikt betyr «allerede sendt», og da hoppes mottakeren over), lages varselet: rader i `internal_messages` og `internal_message_recipients`, med samme felter som systemmeldingene fra `send-reminder`. `sender_id` er den som handlet, eller null ved cron. `company_id` er mottakerens selskap.
- Kan ikke innboksmeldingen opprettes etter at loggraden er satt inn, slettes loggraden igjen (og en eventuell halvferdig melding), slik at neste kjøring prøver på nytt.
- E-post sendes via `getEmailConfig` og `sendEmail` med selskapets avsender, men bare når `email_audit_tasks` ikke er false. Mangler raden, sendes e-post. Det sendes aldri SMS. Feil i e-posten logges bare og fører ikke til ny sending, siden innboksen er hovedkanalen.
- For tildeling inngår mottakeren i hva som regnes som samme varsel, slik at en ny ansvarlig alltid varsles én gang.

## Steg 3 – Funksjonen `audit-notify`
- JWT-validering, deretter lesing av funnet med brukerens tilgangsregler (403 hvis brukeren ikke får lest det). Etterpå leses tilstanden med service role.
- Hendelsen må stemme med tilstanden: ansvarlig er satt ved tildeling, ≥1 tiltak og alle lukket ved «klar for verifisering», og status `verified` ved verifisering. Hvis ikke, svarer funksjonen `{ sent: 0, skipped: "state_mismatch" }`.
- Zod-validering av input, CORS og try/catch per mottaker.

## Steg 4 – Funksjonen `audit-deadline-reminders`
- Uten riktig `x-cron-secret` (sammenlignet med `AUDIT_CRON_SECRET`) svarer den 401.
- Den henter åpne tiltak og funn som ikke er verifisert, med frist i vinduet, og bruker selskapets konfig. Funksjonen tåler å kjøres flere ganger samme dag, og en feil per element logges uten at kjøringen stopper. Svaret er antall sendt per type.

## Steg 5 – Appen
- Ny `notifyAudit(event, ids)` kalles etter vellykket lagring i `useInternalAuditMutations` (funn eller tiltak med ansvarlig, endret ansvarlig, lukket tiltak og verifisert funn). Feil i varslingen ruller aldri tilbake lagringen, og det vises bare en diskret melding.
- «Send påminnelse» (bare admin) på funn og tiltak i revisjonsvinduet åpner det eksisterende purrevinduet med ansvarlig forhåndsvalgt og lenke til funnet. Purrevinduet får en valgfri mulighet for forhåndsvalgte mottakere og lenke. Selve purrefunksjonen på serveren er uendret.
- Ny bryter «E-post om revisjonsoppgaver» står sammen med de andre e-postbryterne i varslingsinnstillingene.
- Alle tekster finnes i `no.json` og `en.json`.

## Steg 6 – Tester og kontroll
- `tests/auditNotify.test.ts`:
  - Mottakere per hendelse: Den som handler, varsles ikke, og administratorer i eierselskapet får «klar for verifisering».
  - Tekst på nb og en.
  - Tidsvinduer med standardkonfig: frist om 7, 3 og 0 dager gir «snart», frist i går og for 10 dager siden gir «forfalt», og frist om 8 dager gir ingenting.
  - Funn og tiltak med samme frist og samme ansvarlige gir én påminnelse (for tiltaket), ikke to.
- Utvidet test for reminderActions (Audit*-koder gir bare «Åpne»), og `auditI18n` skal fortsatt bestå.
- `deno check --node-modules-dir=auto` på `audit-notify`, `audit-deadline-reminders`, `send-reminder` og alle andre funksjoner som importerer endrede `_shared`-filer (`reminderActions.ts`). Resultatet rapporteres.

## Tekniske detaljer
- Begge funksjonene har `verify_jwt = false` i config, og autentiseringen skjer i koden.
- AGENTS.md (revisjon) får én regel: varsler beregnes på serveren fra tilstand via `_shared/auditNotify.ts`, og dupliseringen hindres av `audit_notification_log`.
