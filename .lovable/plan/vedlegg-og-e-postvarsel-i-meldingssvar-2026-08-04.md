# Vedlegg og e-postvarsel i meldingssvar

To utvidelser av inbox/meldingstråder:
1. Avkrysning "Send også som e-post" i svarfeltet (av som standard).
2. Opplasting av filer/bilder i chatten, synlig for alle deltakere i tråden.

## E-post-avkrysning

- Ny checkbox under svarfeltet i meldingsdialogen, umerket som standard, med i18n-nøkler i både `no.json` og `en.json`.
- Valget sendes videre som `channels: { email: true }` til `send-message`-funksjonen (samme mekanisme som Ny melding-dialogen bruker i dag).
- I dag ignorerer serveren e-postkanalen for ikke-admins. Svar i en tråd blir unntatt: alle deltakere i en eksisterende tråd får lov til å sende e-postvarsel til de andre deltakerne. Nye meldinger (ikke svar) beholder dagens admin-begrensning.
- E-posten som sendes får samme utforming som i dag, med lenke tilbake til meldingen i AviSafe, og lister vedlegg som lenker når det finnes vedlegg.

## Vedlegg (fil/bilde)

- Ny privat storage-bucket `message-attachments`, filer lagret under `<thread_root_id>/<message_id>/<filnavn>`.
- Ny tabell `internal_message_attachments` (message_id, storage_path, filnavn, mime-type, størrelse, opplaster, tidspunkt) med GRANT + RLS: lese/skrive kun for deltakere i tråden, gjenbruk av eksisterende `can_access_message`-funksjon.
- RLS på `storage.objects` for bucketen bruker samme deltakersjekk, slik at kun trådens deltakere kan hente filene. Nedlasting/visning skjer via signerte URL-er (1 time), i tråd med eksisterende mønster i appen.
- Grensesnitt: binders-ikon ved svarfeltet (og i Ny melding-dialogen), valgte filer vises som fjernbare chips før sending. Bilder vises som miniatyrbilde i meldingsboblen og åpnes i full størrelse ved klikk; andre filer vises som nedlastbar rad med ikon, navn og størrelse.
- Grense: maks 5 filer per melding, 10 MB per fil, vanlige bilde-/dokumenttyper. Feilmeldinger via toast, i18n.
- Push-varsel og e-post nevner at meldingen har vedlegg.

## Teknisk

- Filer lastes opp fra klienten etter at meldingen er opprettet: `send-message` returnerer allerede `message_id`, som brukes til opplasting og innsetting av vedleggsrader.
- Berørte filer: `src/components/profile/InboxTab.tsx`, `ComposeMessageDialog.tsx`, `hooks/useSendMessage.ts`, ny `hooks/useMessageAttachments.ts`, `useMessageThread.ts` (hente vedlegg for tråden), `supabase/functions/send-message/index.ts`, ny migrasjon + bucket, samt `no.json`/`en.json`.
