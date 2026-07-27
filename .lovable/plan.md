## Mål
Utvid inboxen til en fullverdig meldingstjeneste: alle brukere kan opprette nye meldinger til folk i eget selskap (og synlige avdelinger), svare på meldinger de har mottatt, og superadmin kan sende til hvem som helst med gyldig svar-rute tilbake.

## Backend (Supabase)

### 1. Migrasjon: `internal_messages`
- Legg til `parent_id UUID REFERENCES internal_messages(id) ON DELETE SET NULL` for tråd-/svarrelasjon.
- Legg til `thread_root_id UUID` (settes = `parent_id`s root eller egen id ved insert) for enkel trådhenting.
- Index på `(recipient_id, thread_root_id)` og `(sender_id, created_at)`.
- Trigger som setter `thread_root_id` automatisk (root = seg selv hvis ingen parent, ellers parent sin root).

### 2. RLS-oppdatering
- Behold eksisterende SELECT-policyer (recipient/sender + admin i eget selskap).
- **Ny INSERT-policy** "Users can send messages":
  - Alle innloggede brukere kan sende hvis `sender_id = auth.uid()` OG mottaker er "kontaktbar":
    - mottaker er i samme selskapshierarki (`recipient.company_id IN (select get_user_visible_company_ids(auth.uid()))`), ELLER
    - avsender er superadmin (`has_role(auth.uid(),'superadmin')`), ELLER
    - meldingen er et svar (`parent_id IS NOT NULL`) der brukeren var mottaker eller avsender i parent-meldingen (tillater svar tilbake til superadmin på tvers av selskap).
- `company_id` på svar = parent.company_id (håndteres i edge function / trigger).

### 3. RPC: `search_message_recipients(query text)`
- SECURITY DEFINER, returnerer `{id, full_name, email, company_id, company_name, role}`.
- Hvis caller er superadmin: søker i alle profiler.
- Ellers: søker kun i profiler der `company_id IN get_user_visible_company_ids(caller)`.
- Filtrerer på `full_name ILIKE %query%` eller `email ILIKE %query%`, LIMIT 30.
- Brukes i compose-dialogens søkbare mottakerliste (autocomplete).

### 4. Edge function: `send-message` (ny, splitt fra send-reminder)
- Fjerner admin-only-restriksjon.
- Input: `recipient_ids[]`, `subject`, `body`, `parent_id?`, `channels {email?, sms?, inbox: true}`.
- Server-side validering:
  - Hvis `parent_id` er satt: hent parent, sett `subject = "Re: " + parent.subject` hvis ikke oppgitt, `company_id = parent.company_id`, verifiser at caller = parent.recipient_id ELLER caller = parent.sender_id.
  - Ellers: verifiser hver mottaker mot samme hierarki-regel som RLS (superadmin bypass).
- Sender inbox-melding alltid; email/SMS kun hvis avsender er admin/superadmin (unngå at vanlige brukere spammer via email/SMS-kanaler). Innsiden av appen (inbox) er åpen for alle.
- Beholder `send-reminder` for compliance-flyten (finding_key, deep_link fra audit).

### 5. `useInboxMessages`-hook
- Utvid til å hente `parent_id`, `thread_root_id` og en `reply_count` (via aggregert query eller separat call).

## Frontend

### 1. Ny komponent: `ComposeMessageDialog.tsx`
- Åpner fra "Ny melding"-knapp i `InboxTab` header.
- Felter:
  - **Til**: multi-select autocomplete som kaller `search_message_recipients` RPC (debounced 250ms). Viser navn + selskap som badge. Superadmin ser selskap-etikett tydelig for cross-company.
  - **Emne**: text input.
  - **Melding**: textarea.
  - Admin/superadmin får kanal-toggles (E-post/SMS/Inbox), vanlige brukere ser kun "Send via inbox".
- Kaller `send-message` edge function via `supabase.functions.invoke`.
- i18n: nye nøkler under `inbox.compose.*` i både `no.json` og `en.json`.

### 2. Reply-flow i `InboxTab`
- I meldings-Sheet (linje 98–145): ny knapp **"Svar"** ved siden av "Gå til modul" hvis `selected.sender_id` finnes (dvs. ikke systemmelding uten avsender).
- "Svar" åpner `ComposeMessageDialog` forhåndsutfylt med:
  - `parent_id = selected.id`
  - `recipient_ids = [selected.sender_id]`
  - `subject = "Re: " + selected.subject`
- Trådhistorikk vises inline i Sheet: hent alle meldinger med samme `thread_root_id` og render som chat-stil boble-liste (nyeste nederst), med avsendernavn + tidsstempel.

### 3. `InboxTab` header
- Ny **"+ Ny melding"**-knapp øverst til venstre for filter-tabs.
- På mobil: ikonknapp for å spare plass.

### 4. Sendt-fane (valgfri utvidelse)
- Legg til en fjerde filter-tab "Sendt" som viser meldinger der `sender_id = auth.uid()`. Gjør at brukeren kan se historikk over egne sendte meldinger.

## Tekniske detaljer

- **Tråd-root**: Trigger `BEFORE INSERT` på `internal_messages` setter `thread_root_id = COALESCE((SELECT thread_root_id FROM internal_messages WHERE id = NEW.parent_id), NEW.id)`.
- **Superadmin cross-company svar**: RLS INSERT policy sjekker `EXISTS (SELECT 1 FROM internal_messages parent WHERE parent.id = NEW.parent_id AND (parent.sender_id = auth.uid() OR parent.recipient_id = auth.uid()))` — dette dekker både superadmin→bruker og bruker→superadmin-svar.
- **GRANT**: `GRANT EXECUTE ON FUNCTION public.search_message_recipients(text) TO authenticated;`
- **Realtime**: eksisterende `postgres_changes`-subscription i `useInboxMessages` fanger opp nye meldinger inkludert svar automatisk.
- **Rate limiting**: klientsidesjekk — disable send-knapp 2s etter click; ingen dedikert backend-limit (matcher appens øvrige mønster).

## Filer som endres/opprettes

Nye:
- `supabase/migrations/<ts>_internal_messages_threads.sql`
- `supabase/functions/send-message/index.ts`
- `supabase/functions/send-message/` registrert i `supabase/config.toml`
- `src/components/profile/ComposeMessageDialog.tsx`
- `src/components/profile/hooks/useMessageThread.ts`
- `src/components/profile/hooks/useSearchRecipients.ts`
- `src/components/profile/hooks/useSendMessage.ts`

Endres:
- `src/components/profile/InboxTab.tsx` (compose-knapp, reply-knapp, trådvisning, sendt-tab)
- `src/components/profile/hooks/useInboxMessages.ts` (parent_id/thread_root_id)
- `src/i18n/locales/no.json` + `en.json` (inbox.compose.*, inbox.reply, inbox.newMessage, inbox.thread.*, inbox.filter.sent)

## Ikke i scope
- Vedlegg (filer/bilder) — kan komme i senere fase.
- Push-varsler til mobil (bruker eksisterende varsel-infrastruktur uendret).
- Gruppechat / kanaler — kun 1:1 og 1:mange broadcast (én insert per mottaker som i dag).