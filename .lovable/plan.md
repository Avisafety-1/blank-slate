## Mål
En meldingstråd = én rad i inboxen, med badge som viser antall usette meldinger i tråden. Varsel-telleren over profil-ikonet teller tråder, ikke enkeltmeldinger.

## Slik løses det (frontend, ingen DB-endringer)

**1. Gruppering i `useInboxMessages.ts`**
- Etter at radene er hentet (samme spørringer som i dag), grupperes de på trådnøkkel = `thread_root_id ?? id`.
- For hver gruppe beholdes den nyeste meldingen som representant, og det legges til:
  - `thread_unread_count` — antall meldinger i tråden med status `unread` (kun for mottatte, ikke "Sendt"-fanen)
  - `thread_message_count` — totalt antall meldinger i tråden
  - `thread_message_ids` — alle id-er i gruppen (brukes ved markering som lest/ferdig)
  - `status` settes til `unread` hvis minst én melding i tråden er ulest
- Emnet vises uten «SV:»-prefiks-duplikat: bruk emnet fra den eldste meldingen i gruppen.
- Filtrene beholdes: «Ulest» viser tråder med minst én ulest melding, «Ferdig» tråder der alle er ferdig, «Sendt» grupperes på samme måte.

**2. Visning i `InboxTab.tsx`**
- Ny badge på raden når `thread_unread_count > 1`: f.eks. «3 nye» ved siden av emnet (i tillegg til dagens blå prikk).
- Behold tråd-ikonet/deltaker-badgen for gruppesamtaler.
- Når tråden åpnes markeres alle uleste meldinger i tråden som lest (ikke bare den øverste).

**3. Markering som lest/ferdig (`useMarkMessage`)**
- Utvides til å ta imot en liste med meldings-id-er og oppdatere `internal_message_recipients` med `.in("message_id", ids)` for gjeldende bruker. «Merk som ferdig» markerer hele tråden.

**4. Telleren over profil-ikonet (`useUnreadMessagesCount.ts`)**
- I stedet for `count: exact` på uleste rader, hentes uleste rader med tilhørende `internal_messages(thread_root_id, id)` og antall unike trådnøkler returneres. Realtime-oppdatering beholdes som i dag.

**5. i18n**
- Nye nøkler i både `no.json` og `en.json`: `inbox.newInThread` («{{count}} nye» / «{{count}} new») og evt. `inbox.threadCount`.

## Teknisk merknad
Alt gjøres i eksisterende hooks/komponenter; ingen migrasjoner. Datamengden er allerede begrenset til 200 rader per henting, så gruppering i klienten er trygt.
