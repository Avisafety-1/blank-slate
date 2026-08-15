# Avvik-fane på /hendelser

## Mål
Ny, oversiktlig visning av alle avvik som rapporteres etter endt flytur, tilgjengelig fra hendelsessiden. Full i18n og responsiv fra mobil til desktop.

## Toppen av /hendelser
- «Hendelser»-tittelen får en ramme/bakgrunn (pill/kort i glass-stil) og blir klikkbar.
  - Står du på Hendelser-fanen: klikk gjør ingenting (aktiv tilstand).
  - Står du på Avvik-fanen: klikk tar deg tilbake til Hendelser.
- Ved siden av tittelen: knapp «Avvik» med antall-badge som bytter til avviksfanen (samme side, egen visning, uten å laste siden på nytt).

## Avvikskort
Hvert avvik vises som et kort med:
- Kategori-sti (brødsmuler), kommentar, kritisk fase (takeoff / i luften / landing), tidspunkt og rapportør.
- Oppdragsdata: oppdragstittel (klikkbar → oppdragsdialog), dato, lokasjon, oppdragstype, risikovurdering (score/SAIL/ARC-badge hvis den finnes).
- Ressurser: drone(r), utstyr og personell knyttet til oppdraget, samt flytur (varighet) hvis avviket er knyttet til en flylogg.
- Statusmerke: Ny / Under behandling / Lukket, og merke «Hendelse etterspurt» eller «Hendelse opprettet».

### Handlinger på kortet
1. **Rediger** – kategori, kommentar og fase. Tillatt for rapportør, admin og oppdragsansvarlig.
2. **Kommentér** – tråd med kommentarer under kortet (navn + tidspunkt).
3. **Send melding** – åpner melding i Avisafe-meldingssystemet med avhuking for e-postvarsel, forhåndsutfylt mottaker (pilot/rapportør) og referanse til avviket.
4. **Be pilot om å opprette hendelse** – sender intern melding (valgfri e-post) med lenke til avviket, og markerer avviket «Hendelse etterspurt».
5. **Opprett hendelse** – åpner eksisterende «Legg til hendelse»-dialog forhåndsutfylt med oppdrag, pilot, drone, dato og avvikstekst; når hendelsen lagres kobles den til avviket.

## Filter og oversikt
- Søk i tekst/kategori, filter på status, kategori og periode; sortering på nyeste/eldste.
- Kompakt nøkkeltallsrad: totalt, åpne, hendelse etterspurt, siste 30 dager.
- Kortliste i én kolonne på mobil og to kolonner på store skjermer; alle handlinger samles i en «flere valg»-meny på mobil.

## Teknisk
- **Database (migrasjon):**
  - `mission_deviation_reports`: nye kolonner `status` (text, default `new`), `incident_id` (uuid, nullable), `incident_requested_at`, `incident_requested_by`, `updated_at`, `updated_by`.
  - Ny tabell `deviation_report_comments` (id, deviation_id, company_id, author_id, comment_text, created_at) med GRANTs (authenticated + service_role) og RLS scoped via `get_user_visible_company_ids()`.
  - UPDATE-policy på `mission_deviation_reports`: rapportør, admin eller oppdragsansvarlig innen synlige selskaper.
- **Frontend:**
  - Ny komponentmappe `src/components/deviations/`: `DeviationsView.tsx` (liste/filter), `DeviationCard.tsx`, `EditDeviationDialog.tsx`, `DeviationCommentThread.tsx`, `DeviationMessageDialog.tsx`.
  - Ny hook `src/hooks/useDeviationReports.ts` som henter avvik + tilhørende oppdrag, risikovurdering, ressurser, flylogg og profilnavn i batch.
  - `src/pages/Hendelser.tsx`: fane-state (`incidents` | `deviations`), klikkbar tittel-pill, «Avvik»-knapp, rendering av `DeviationsView`.
  - Melding sendes via eksisterende meldingsflyt (`internal_messages` + send-message edge function) med e-post-avhuking.
  - Alle nye strenger som `t()`-nøkler i både `no.json` og `en.json`; kategorinavn gjennom `translateDeviationCategory`.
