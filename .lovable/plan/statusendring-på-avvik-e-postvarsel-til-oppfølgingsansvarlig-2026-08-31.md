# Statusendring på avvik + e-postvarsel til oppfølgingsansvarlige

## Mål
1. Oppfølgingsansvarlige kan sette avviksstatus til Ny / Under behandling / Ferdigbehandlet.
2. Nye avvik utløser e-post til oppfølgingsansvarlige i selskapet.
3. Varslingsvalget i «Min profil» får nytt navn som dekker både hendelser og avvik.

## Statusendring i UI
- På hvert avvikskort (Avvik-fanen på /hendelser) kommer statusmerket til å bli en liten nedtrekksmeny med de tre statusene.
- Kun brukere med rollen oppfølgingsansvarlig (`profiles.can_be_incident_responsible`) ser menyen. Alle andre ser statusen som i dag, uten mulighet til å endre.
- Ved endring: umiddelbar oppdatering i listen, bekreftelses-toast, og feilmelding hvis lagring avvises.
- Statusfilteret som allerede finnes øverst fungerer da som reell filtrering.

## E-postvarsel ved nytt avvik
- Når et avvik registreres etter flytur, sendes e-post til godkjente brukere i samme selskap som både har rollen oppfølgingsansvarlig og har varslingsvalget påslått.
- E-posten inneholder oppdragstittel, kategori-sti, fase, kommentar, rapportør og tidspunkt, med lenke til avvikslisten.
- Rapportøren selv varsles ikke.

## Navn på varslingsvalget
- «E-post ved nye hendelser» endres til «E-post ved nye hendelser og avvik», med oppdatert beskrivelse. Samme på engelsk. Selve innstillingsfeltet i databasen (`email_new_incident`) beholdes, så eksisterende valg til brukerne bevares.

## Teknisk
- **Migrasjon:** ny/erstattet UPDATE-policy på `mission_deviation_reports` som kun tillater oppdatering når brukeren har `can_be_incident_responsible = true` og avviket ligger i et selskap brukeren ser (`get_user_visible_company_ids()`). Trigger/`updated_by`-felt settes fra klienten som i dag.
- **Frontend:**
  - `src/components/deviations/DeviationCard.tsx`: statusmeny (Select) med rollesjekk.
  - `src/components/deviations/DeviationsView.tsx` / `src/hooks/useDeviationReports.ts`: `updateStatus`-funksjon som skriver `status`, `updated_at`, `updated_by` og oppdaterer lokal state.
  - Rollesjekk hentes via `profiles.can_be_incident_responsible` for innlogget bruker (liten hook/query).
  - `src/components/DeviationReportDialog.tsx`: kaller varselfunksjonen etter vellykket lagring (feil i utsending blokkerer ikke lagringen).
  - `src/components/ProfileDialog.tsx`: kun tekstnøkler endres.
- **Edge function:** ny handler `notify_new_deviation` i `supabase/functions/send-notification-email/index.ts` som filtrerer mottakere på `can_be_incident_responsible` + `email_new_incident`, og sender via eksisterende Resend-oppsett og avsenderkonfigurasjon.
- Alle nye strenger legges i både `no.json` og `en.json`.
