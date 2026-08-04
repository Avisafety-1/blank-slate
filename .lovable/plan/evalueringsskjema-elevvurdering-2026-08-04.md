# Evalueringsskjema (elevvurdering)

Ny knapp "Evalueringsskjema" på /dokumenter ved siden av "Ny sjekkliste". Denne fasen dekker kun opprettelse/redigering av skjemamaler med en live forhåndsvisning som viser hvordan skjemaet ser ut i bruk. Kobling mot oppdrag og faktisk utfylling kommer senere.

## Slik fungerer det

**Bygger (venstre side av dialogen)**
- Skjematittel + valgfri beskrivelse
- Hovedkategorier som kan legges til, flyttes opp/ned og slettes
- Under hver hovedkategori: underkategorier med navn og forklarende tekst (hva som vurderes)
- Skala er fast 1–6 per underkategori
- Superadmin kan sette global synlighet (samme mønster som sjekklister)

**Forhåndsvisning (høyre side, "slik ser skjemaet ut")**
- Topptekst: instruktør, elev, oppdrag, dato/klokkeslett for oppdraget, dato for gjennomført evaluering — vises som felter (låst i preview)
- Per hovedkategori: kort med underkategorier, 1–6 karakterknapper, kommentarfelt "hvorfor denne karakteren"
- Automatisk snittkarakter per hovedkategori, vist i kategorioverskriften
- Nederst: fritekstfelt "Totalvurdering" og samlet snitt for hele skjemaet
- I preview er snittberegningen levende, så man kan klikke og se hvordan det oppfører seg

På mobil stables bygger og forhåndsvisning (fanevalg Bygg / Forhåndsvisning) i stedet for to kolonner.

## Data

To nye tabeller i databasen:

- `evaluation_templates` — tittel, beskrivelse, `structure` (jsonb med hovedkategorier/underkategorier), company_id, created_by, global_visibility, is_active
- `evaluation_responses` — template_id, mission_id (nullable), instruktør, elev, tidspunkter, `scores` (jsonb), totalvurdering, company_id

Kun `evaluation_templates` brukes i denne fasen; `evaluation_responses` opprettes nå slik at senere oppdragsintegrasjon ikke krever ny migrasjon.

RLS: leses av brukere i eget selskap (+ hierarki via `get_user_visible_company_ids()`), skrives av admin/superadmin. Globale maler (global_visibility) leses av alle. GRANTs på begge tabeller for `authenticated` og `service_role`.

## Teknisk

- Migrasjon: nye tabeller, grants, RLS, `updated_at`-trigger
- `src/components/documents/EvaluationFormDialog.tsx` — split-view bygger + preview
- `src/components/evaluation/EvaluationFormPreview.tsx` — gjenbrukbar renderer, brukes både som preview (readonly-ish) og senere som faktisk utfyllingsskjema
- `src/hooks/useEvaluationTemplates.ts` — liste/opprett/oppdater/slett
- `src/pages/Documents.tsx` — ny sekundærknapp med ClipboardCheck-ikon, admin-only, samt en liste/seksjon for eksisterende evalueringsskjemaer med rediger/slett
- Alle strenger via `t()` med nye nøkler i både `no.json` og `en.json`
- Semantiske design tokens, ingen hardkodede farger
