# Compliance Messaging + Intern Inbox

Legger til en «Send påminnelse»-handling på hver compliance-alert som kan sende via **e-post (Resend)**, **SMS (GatewayAPI)** og **intern AviSafe-melding**. I tillegg opprettes en ny fane «Inbox» på profilsiden ved siden av «Profil», med badge for uleste meldinger og deep link + kvittering (lest / utført).

## 1. Database (én migrasjon)

Ny tabell `internal_messages`:
- `sender_id`, `recipient_id`, `company_id`
- `subject`, `body`
- `deep_link` (relativ URL til modul, f.eks. `/oppdrag/<id>` eller `/flightlog/<id>`)
- `finding_key` (matcher `ComplianceScanner`-funn så vi kan lukke auto)
- `status` (`unread` | `read` | `done`), `read_at`, `done_at`
- `channels_sent` (jsonb: `{email:true, sms:false, inbox:true}`)
- `severity` (`critical`/`warning`/`info`)

Ny tabell `internal_message_receipts` (send-logg per kanal):
- `message_id`, `channel` (`email`/`sms`/`inbox`), `status` (`sent`/`failed`), `provider_id`, `error`, `sent_at`

RLS: mottaker og avsender ser egne meldinger; admin ser selskapets. GRANTs for `authenticated` + `service_role`. Company-scoped via `company_id`. Trigger for `updated_at`. Realtime enabled på `internal_messages` for badge-oppdatering.

## 2. Edge function: `send-reminder`

Én funksjon tar `{ recipient_ids, subject, body, deep_link, finding_key, severity, channels }`.
- Validerer at avsender er admin i samme selskap som mottakerne.
- Skriver `internal_messages`-rad per mottaker (alltid, kalt «inbox»-kanalen).
- Hvis `channels.email`: henter mottakers e-post fra `profiles`, sender via Resend-connector.
- Hvis `channels.sms`: henter `phone_number`, sender via GatewayAPI-connector.
- Skriver `internal_message_receipts` per kanal m/ status.
- Deep link i e-post/SMS peker på `${APP_URL}${deep_link}?msg=<id>` slik at åpning kan markere som lest.

## 3. Frontend – Compliance alert-rad

I `ComplianceAlertsPanel.tsx`: legg til ny knapp «Send påminnelse» ved siden av «Open»/«Ignore».
- Åpner `SendReminderDialog.tsx` med:
  - Auto-utledet mottaker (pilot for kompetanse-funn, drone-eier for service, mission owner/pilot for flight-not-closed, SORA-eier for missing risk assessment) – vises som chip, kan endres/utvides via combobox mot `profiles` i selskapet.
  - Kanal-checkboxer (E-post, SMS, Inbox) – Inbox alltid på og disabled.
  - Forhåndsutfylt emne + tekst basert på funn-tittel (i18n `audit.reminder.templates.*`), redigerbart.
  - «Send»-knapp kaller `send-reminder`.
- Bruker `useSendReminder`-hook (React Query mutation) med toast + kvitteringsvisning (hvilke kanaler lyktes).

Auto-mottakerlogikk plasseres i `src/components/admin/audit/services/ReminderRecipientResolver.ts` (tar `Finding` → returnerer forslag).

## 4. Frontend – Intern Inbox på profilsiden

Ny fane «Inbox» ved siden av eksisterende «Profil» i `src/pages/Profile.tsx` (eller tilsvarende):
- Ny komponent `src/components/profile/InboxTab.tsx`.
- Liste av meldinger (unread først, filter: Alle / Uleste / Utført).
- Rad viser: severity-pill, emne, avsender, tid, deep link-knapp.
- Klikk på rad: markerer `read`, åpner detaljdrawer med full tekst + «Gå til modul» (deep link) + «Marker som utført».
- «Marker som utført» setter `status='done'`, `done_at=now()`.
- Badge med uleste-antall vises på fane-triggeren og i topbar-avatar (via `useUnreadMessagesCount` med Realtime-subscription på `internal_messages` filtrert på `recipient_id=auth.uid()`).

Deep-link håndtering: en liten `useMarkMessageOpenedFromQuery`-hook leser `?msg=<id>` i URL og markerer som lest ved landing.

## 5. i18n

Nye nøkler i både `no.json` og `en.json` under `audit.reminder.*` og `inbox.*` (fane-tittel, filtre, tomstate, kanal-etiketter, standardmaler per funn-type, toasts).

## 6. Tilgang / synlighet

- «Send påminnelse»-knappen er kun synlig for admins (`is_admin`) i selskapet.
- Inbox-fanen er synlig for alle innloggede brukere.
- Ingen endring i selskaps-allowlist – dette er tilgjengelig for alle selskaper (ikke bundet til moderavdeling).

## Tekniske detaljer

- Resend + GatewayAPI: eksisterende connectors, edge function bruker `Deno.env.get('RESEND_API_KEY')` og `Deno.env.get('GATEWAYAPI_API_KEY')` gjennom `connector-gateway.lovable.dev`.
- Realtime badge: `supabase.channel('inbox').on('postgres_changes', {schema:'public', table:'internal_messages', filter:`recipient_id=eq.${uid}`}, ...)` – ryddes i `useEffect` cleanup.
- Auto-lukking av funn: senere fase – funn-key lagres allerede, så vi kan matche `internal_messages.done_at` mot scanner-resultat for å skjule håndterte alerts. (Ikke inkludert i denne fasen; kun feltet forberedes.)
- SMS-mottakere uten `phone_number` → kanal markeres `failed` med feilmelding «Mangler telefonnummer», e-post/Inbox går uansett.

## Filer som opprettes/endres

Nye:
- `supabase/functions/send-reminder/index.ts`
- `src/components/admin/audit/SendReminderDialog.tsx`
- `src/components/admin/audit/services/ReminderRecipientResolver.ts`
- `src/components/admin/audit/hooks/useSendReminder.ts`
- `src/components/profile/InboxTab.tsx`
- `src/components/profile/hooks/useInboxMessages.ts`
- `src/components/profile/hooks/useUnreadMessagesCount.ts`

Endres:
- `src/components/admin/audit/ComplianceAlertsPanel.tsx` (ny rad-handling)
- `src/pages/Profile.tsx` (ny Tabs-struktur Profil / Inbox)
- Topbar-avatar (badge)
- `public/locales/no/*.json`, `public/locales/en/*.json`
