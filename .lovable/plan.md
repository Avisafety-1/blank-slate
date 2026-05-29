## Mål

I admin-listen «Oppdragstyper» skal hver type kunne ha et tilknyttet dokument fra selskapets dokumentbibliotek. Når en bruker oppretter et oppdrag med den typen, blir dokumentet automatisk lagt til på oppdragskortet (samme mekanisme som `mission_documents` bruker i dag).

## Endringer

### 1) Database (migrering)
- `company_mission_types` får ny kolonne `default_document_id uuid null` med FK mot `documents(id) ON DELETE SET NULL`.
- Ingen endringer i RLS – arves fra eksisterende policy.

### 2) Admin-UI – `src/components/admin/MissionTypesSection.tsx`
- I hver rad i listen, ved siden av Aktiv-bryteren, legges en kompakt dokument-velger:
  - Hvis ingen valgt: liten knapp «Tilknytt dokument» (paperclip-ikon).
  - Hvis valgt: viser dokumenttittel som chip + lite kryss for å fjerne tilknytningen.
- Klikk på knappen åpner en enkel popover/dialog med søkbar liste over selskapets `documents` (samme scoping som dokumentmodulen bruker). Bruker velger ett dokument → lagres til `default_document_id`.
- Read-only når listen er arvet fra moderselskap.
- Hook `useCompanyMissionTypes` utvides til å returnere `default_document_id` (+ tittel via join) slik at UI kan vise det.

### 3) Auto-tilknytning ved oppretting – `src/components/dashboard/AddMissionDialog.tsx`
- Etter at oppdraget er lagret og eventuelle brukervalgte dokumenter er knyttet, slå opp valgt `mission_type` i `types`-listen.
- Hvis typen har `default_document_id`, kall `supabase.from("mission_documents").insert({ mission_id, document_id })` (idempotent: hopp over hvis allerede tilstede fra brukerens egne valg).
- Gjelder kun ved oppretting (ikke ved redigering av eksisterende oppdrag, for å unngå at fjernede dokumenter dukker opp igjen).

## Tekniske detaljer
- Endringen er ren frontend + en kolonne. Ingen edge functions.
- Standardtyper som ennå ikke finnes i `company_mission_types` (kun finnes via `DEFAULT_MISSION_TYPES`) kan ikke ha tilknyttet dokument før admin har lagret en eksplisitt rad. Hvis vi vil støtte det også for defaults, må vi først seede default-radene for selskapet – dette anbefales gjort *lazy* første gang admin åpner dokumentvelgeren for en default-type (insert rad med samme label).
- Memory `mem://features/admin/editable-mission-types` oppdateres etter implementasjon.