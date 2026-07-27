
## Mål
Gjør høyre-sheet i innboksen til en fullverdig samtaletråd: alle meldinger stablet i kronologisk rekkefølge, scrollbart område, og et innebygd svarfelt nederst — ingen ekstra dialog for svar.

## Endringer

### `src/components/profile/InboxTab.tsx`
- Fjern `openReply`-flyten som åpner `ComposeMessageDialog` for svar. `ComposeMessageDialog` beholdes kun for "Ny melding".
- Restrukturer `SheetContent` til tre vertikale soner med flex-layout:
  1. **Header** (fast): emne, avsender, dato, severity-badge, "Gå til modul"/"Marker ferdig"-knapper flyttes hit som en kompakt actions-rad.
  2. **Tråd** (scrollbar, `flex-1 overflow-y-auto`): rendres alltid som stablede meldingsbobler via `thread` (også når `thread.length === 1`, så visningen er konsistent). Behold "mine vs andres"-styling. Legg til `scrollIntoView` på siste boble når `thread` endres.
  3. **Svar-composer** (fast bunn): `Textarea` (`rows={3}`, `maxLength=4000`) + `Send`-knapp. Vises kun når brukeren har lov å svare (tråden har en annen deltaker enn `user.id`). Placeholder: `t("inbox.replyPlaceholder", "Skriv et svar…")`.
- Bruk eksisterende `useSendMessage`-mutasjon. Ved send:
  - `recipient_ids`: unik liste over alle `sender_id` i tråden som ikke er `user.id` (fallback til `selected.sender_id`).
  - `subject`: samme emne som den valgte meldingen (uendret — visning som én tråd, ikke "Re:"-prefiks siden det allerede er samme thread).
  - `body`: composer-tekst.
  - `parent_id`: id-en til siste melding i tråden.
  - `channels`: ingen (svar går alltid kun til innboks).
- Etter vellykket send: tøm tekstfeltet, `queryClient` invalideres allerede av hooken; tråden refetches og siste boble scrolles inn.

### `SheetContent` layout
- `className="w-full sm:max-w-md p-0 flex flex-col h-full"` for å utnytte full høyde.
- Indre soner:
  - Header: `p-4 sm:p-6 border-b shrink-0`
  - Tråd: `flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3`
  - Composer: `border-t p-3 sm:p-4 shrink-0 space-y-2` med `flex justify-end` for Send-knapp.

### i18n
- `no.json`: `inbox.replyPlaceholder = "Skriv et svar…"`, `inbox.sendReply = "Send svar"`.
- `en.json`: `inbox.replyPlaceholder = "Write a reply…"`, `inbox.sendReply = "Send reply"`.

## Uforandret
- `ComposeMessageDialog.tsx` beholdes for "Ny melding"-knappen; ingen endringer i den.
- `useMessageThread`, `useSendMessage`, RLS og edge function `send-message` er allerede kompatible.
- "Sent"-fanen og "Gå til modul"-deep link fungerer som før.

## Filer som endres
- `src/components/profile/InboxTab.tsx`
- `src/i18n/locales/no.json`
- `src/i18n/locales/en.json`
