## Utgangspunkt (verifisert)

- `internal_messages` har én rad per mottaker (`recipient_id`), og SELECT-policyen er `recipient_id = auth.uid() OR sender_id = auth.uid()`. Derfor kan en deltaker i dag **ikke** se meldinger mellom to andre i samme tråd — «gruppetråd» finnes ikke reelt.
- `search_message_recipients` gir superadmin treff på tvers av alle selskaper, men er begrenset til 50 rader og har ingen «alle»/selskapsvalg.
- Innboks og trådvisning viser kun `full_name` (og selskap i mottakervelgeren) — ingen e-post, ingen selskap på selve meldingen.

## Del 1 – Ekte gruppetråder (database)

Én migrasjon:
- Ny tabell `internal_message_recipients (message_id, recipient_id, status, read_at, done_at)` med GRANTs + RLS. Én meldingsrad kan da ha flere mottakere uten duplikater.
- Backfill fra dagens `internal_messages.recipient_id`-rader (ingen historikk går tapt; kolonnen beholdes for kompatibilitet).
- `SECURITY DEFINER`-funksjon `is_thread_participant(_thread_root uuid, _user uuid)` som sjekker om brukeren er avsender eller mottaker på en melding i tråden (unngår rekursiv RLS).
- Ny SELECT-policy på `internal_messages`: synlig hvis avsender, mottaker **eller** deltaker i tråden. Da ser alle i en gruppetråd hele historikken.
- UPDATE (les/ferdig) flyttes til `internal_message_recipients` slik at «lest» er per person.
- `internal_messages` får `is_broadcast boolean` + `broadcast_scope jsonb` for å skille kringkasting fra gruppetråd.

## Del 2 – Broadcast for Avisafe-superadmin

- `send-message` utvides med `audience: { mode: "all" | "companies", company_ids?: string[] }`. Kun tillatt for superadmin i selskapet «Avisafe» (serverside-sjekk mot rolle + selskap), ellers 403.
- Broadcast-rader merkes `is_broadcast = true` og får **ikke** delt tråd: svar går kun tilbake til avsender (privat 1-til-1-tråd), slik du valgte.
- Vanlige flermottaker-meldinger (ikke broadcast) blir én delt tråd der «svar» går til alle deltakere.
- Ny RPC `resolve_broadcast_audience(mode, company_ids)` (SECURITY DEFINER, superadmin-only) som returnerer mottakerliste + antall, brukt både til forhåndsvisning og faktisk utsending.
- E-post/SMS er tillatt for broadcast, men klienten må først vise en bekreftelsesdialog med nøyaktig antall mottakere per kanal før «Send» aktiveres.

## Del 3 – UI

`ComposeMessageDialog`:
- Beholder flervalg av personer (finnes allerede), men mottakersøket viser nå **navn + e-post + selskap** tydelig, og treffgrensen økes/pagineres.
- Nytt «Mottakergruppe»-valg for Avisafe-superadmin: «Alle brukere» eller «Velg selskaper» (søkbar flervalgsliste over selskaper), med live antall mottakere.
- Bekreftelsessteg ved broadcast med e-post/SMS avhuket.

`InboxTab`:
- Listen viser avsender som `Navn · e-post` og «Til: …»-liste for sendte og gruppetråder, med `+N` når det er mange.
- Trådvisningen viser `Navn · Selskap · e-post` over hver melding, ikke bare selskap.
- Deltakerlinje øverst i tråden med alle deltakere.
- Ikon/merke på tråder med flere deltakere og på broadcast-meldinger.

## Del 4 – i18n og verifisering

- Alle nye strenger i både `no.json` og `en.json` under `inbox.*`.
- Test: (1) flermottaker-tråd der tredjepart svarer og alle ser svaret, (2) broadcast til ett valgt selskap, (3) svar på broadcast går kun til avsender, (4) navn/e-post vises korrekt i liste og tråd.

## Teknisk merknad

Ingen eksisterende meldinger mister synlighet: `recipient_id` beholdes, backfill speiler dagens rader inn i den nye mottakertabellen, og gamle policyer erstattes først når den nye deltaker-policyen dekker samme tilfeller.
