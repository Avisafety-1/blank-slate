# Lesebekreftelser synlig for alle i meldingstråden

## Bekreftet nåsituasjon

- `internal_message_recipients.read_at` oppdateres når en mottaker åpner tråden; nylige databaserader viser registrerte lesetidspunkt.
- RLS-regelen gir allerede deltakere i en vanlig gruppetråd tilgang til mottakerstatusen.
- Realtime er aktivert for tabellen.
- Grensesnittet rendrer i dag lesebekreftelsen bare når `sender_id` er den innloggede brukeren. Dette er grunnen til at de andre testkontoene ikke ser den.

## Endring

- Vis lesestatus under hver ikke-broadcast-melding for alle deltakere i tråden, ikke bare meldingens avsender.
- Behold eksisterende statuslogikk:
  - ingen har lest: «Sendt» / «Sent»
  - noen har lest: «Sett av …» / «Seen by …»
  - alle har lest: «Sett av alle» / «Seen by everyone»
- Behold navn, tidspunkt ved hover og eksisterende live-/pollingoppdatering.
- Broadcast-meldinger forblir uten lesebekreftelse.

## Verifisering

- Åpne samme gruppetråd som to deltakere og bekreft at begge ser den samme lesestatusen.
- Bekreft at åpning fra konto nummer to oppdaterer `read_at` og vises i begge åpne tråder.
- Kontrollere at avsenderen fortsatt ser statusen, og at broadcast-meldinger ikke viser den.
- Kontrollere norsk og engelsk visning.

## Teknisk

- Endringen avgrenses til rendringsbetingelsen i `InboxTab.tsx`; ingen databaseskjema- eller RLS-endring er nødvendig ut fra den verifiserte tilstanden.