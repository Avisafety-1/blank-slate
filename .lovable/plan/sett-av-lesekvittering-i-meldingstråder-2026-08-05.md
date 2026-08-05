# "Sett av …" (lesekvittering) i meldingstråder

## Mål

Under hver melding du selv har sendt vises hvem som har lest den, f.eks. «Sett av Sverre, Martin» — og «Sett av alle» når alle mottakere har lest den.

## Slik fungerer det

- Lesetidspunkt lagres allerede når en mottaker åpner tråden (`internal_message_recipients.read_at` settes ved «marker som lest»).
- Ny linje nederst i hver melding **du har sendt**, i liten grå tekst:
  - Ingen har lest: «Sendt»
  - Noen har lest: «Sett av Fornavn Etternavn» (opptil 3 navn, deretter «+ 2 til»)
  - Alle mottakere har lest: «Sett av alle»
- Hover/trykk på linjen viser tidspunkt per person.
- Kun avsender ser lesestatus for sin egen melding; mottakere ser ingenting nytt.
- Oppdateres live sammen med resten av tråden (samme realtime-invalidering som i dag).

## Teknisk

- Ny hook `src/components/profile/hooks/useMessageReadReceipts.ts`
  - Henter `message_id, recipient_id, read_at` fra `internal_message_recipients` for alle `threadMessageIds`.
  - Gjenbruker `fetchParties` for navn/e-post. `staleTime: 0`.
  - RLS er allerede på plass: `can_see_message_recipients` lar trådens deltakere lese andres rader — ingen databaseendring nødvendig.
- `src/components/profile/InboxTab.tsx`
  - Kaller hooken med eksisterende `threadMessageIds`.
  - Rendrer en liten `ReadReceiptLine` under meldingsboblen når `m.sender_id === user.id` og meldingen ikke er broadcast.
- i18n-nøkler i både `no.json` og `en.json`: `inbox.readBy`, `inbox.readByAll`, `inbox.readByMore`, `inbox.notReadYet`.
- Ingen endringer i edge functions eller database.
