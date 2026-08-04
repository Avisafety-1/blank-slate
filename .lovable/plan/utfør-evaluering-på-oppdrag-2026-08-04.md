# Utfør evaluering på oppdrag

Når et oppdrag har en oppdragstype med tilknyttet evalueringsskjema, skal det vises en knapp «Utfør evaluering» (samme blå utforming som «Godkjenn oppdrag») både på /oppdrag-kortene og i oppdragskortet fra dashbordet. Knappen åpner skjemaet ferdig utfylt med nøkkeltall fra oppdraget, og evalueringen kan lagres som utkast eller lagres ferdig.

## Slik fungerer det for brukeren

- Oppdragstypen (f.eks. «Opplæring») har allerede et evalueringsskjema koblet til seg i admin.
- På oppdrag med en slik oppdragstype vises en blå knapp «Utfør evaluering» rett ved «Godkjenn oppdrag» / «Flere valg».
- Klikk åpner en scrollbar dialog med skjemaet:
  - Toppfelt forhåndsutfylt: instruktør (innlogget bruker, eller personell med rolle Instruktør), elev (personell med rolle Elev — kan velges/endres), oppdragsnavn, oppdragets tidspunkt, dato for evaluering.
  - Kategorier/underkategorier med score 1–6, kommentarfelt per underkategori, snitt per kategori og totalsnitt, samt totalvurdering.
- To knapper: «Lagre utkast» og «Lagre».
  - Utkast: lagres og kan åpnes/redigeres videre senere.
  - Lagre: markeres som fullført og låses for videre redigering fra denne knappen (kun visning). Videre handlinger (kobling til personellkortet til eleven o.l.) tas i neste steg.
- Etter at en evaluering finnes for oppdraget endrer knappen tekst til «Se evaluering» (fullført) eller «Fortsett evaluering» (utkast), med et lite merke som viser status.

## Teknisk

Database (migrasjon):
- `evaluation_responses`: legg til `status TEXT NOT NULL DEFAULT 'draft'` (`draft` | `completed`) og `comments JSONB NOT NULL DEFAULT '{}'` (kommentar per underkategori) hvis den ikke allerede dekkes av `scores`.
- Ingen nye tabeller; RLS/grants finnes allerede.

Frontend:
- Ny hook `src/hooks/useMissionEvaluation.ts`:
  - Slår opp `company_mission_types` for oppdragets `oppdragstype` (via `useCompanyMissionTypes`, inkl. arv fra morselskap) og henter `default_evaluation_template_id`.
  - Henter eksisterende `evaluation_responses` for `mission_id` (nyeste), og eksponerer `templateId`, `template`, `response`, `status`.
  - Mutasjoner for `saveDraft` og `saveCompleted` (upsert på respons-id), beregner `overall_average`.
- Ny komponent `src/components/oppdrag/EvaluationMissionButton.tsx`:
  - Samme props-mønster/utforming som `ApproveMissionButton` (`size="sm"`, blå default-variant, `className="w-full sm:w-auto"`, `stopPropagation` på klikk).
  - Skjules når oppdragstypen ikke har skjema.
  - Åpner `EvaluationResponseDialog`.
- Ny dialog `src/components/evaluation/EvaluationResponseDialog.tsx`:
  - Bruker eksisterende `EvaluationFormPreview` i kontrollert modus (`scores`, `comments`, `overallComment`, `onScoreChange` osv.) med `headerDisabled={false}` for topplinjen.
  - Elev-velger fra `mission_personnel` (rolle Elev prioritert), instruktør defaulter til innlogget bruker.
  - `overflow-y-auto overscroll-contain` for scroll (samme mønster som i Documents-dialogen).
  - Footer: Avbryt / Lagre utkast / Lagre.
- Montering: `src/components/oppdrag/MissionCard.tsx` (ved siden av `ApproveMissionButton`) og `src/components/dashboard/MissionDetailDialog.tsx` (rett under/over approve-knappen).
- i18n: nye nøkler under `evaluation.mission.*` i både `no.json` og `en.json` («Utfør evaluering» / «Perform evaluation», «Se evaluering», «Lagre utkast» osv.).
