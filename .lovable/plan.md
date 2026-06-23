## Problem

Den deterministiske vakten bruker allerede `ownStatus` korrekt og trigger ikke hard stop når kun tilknyttede (ikke-valgte) ressurser er røde. Men AI-modellen får fortsatt **aggregert** dronestatus (`Rød`) sammen med årsaker som inkluderer koblet utstyr, og setter dermed selv `hard_stop_triggered = true` i utstyrskategorien. Det er denne AI-genererte hard stop'en som slipper gjennom.

## Endringer (kun `supabase/functions/ai-risk-assessment/index.ts`)

1. **AI-prompt payload — `assignedDrones` og `primaryDrone`:**
   - Send `status` = `ownStatus` (i stedet for aggregert).
   - Behold `aggregatedStatus` som eget felt for innsyn.
   - `statusReasons` settes til `ownReasons` (kun dronens egne årsaker).
   - Legg til `linkedOnlyIssues: linkedReasons` med eksplisitt note: "knyttet utstyr, ikke valgt på dette oppdraget — antas ikke brukt".

2. **Post-AI clearing-steg** (rett før den deterministiske utstyrsvakten ~linje 2140):
   - Hvis `aiAnalysis.hard_stop_triggered === true` OG hard stop-årsaken/utstyrskategorien handler om vedlikehold/utstyr (sjekk `categories.equipment.go_decision === 'NO-GO'` eller nøkkelord "vedlikehold/inspeksjon/utstyr/tilbehør" i `hard_stop_reason`) OG verken `redDrones` (basert på `ownStatus`) eller `redEquipment` (valgt utstyr) finnes:
     - Nullstill `hard_stop_triggered = false`, `hard_stop_reason = null`.
     - Sett `categories.equipment.go_decision` til `GO` eller `BETINGET` (avhengig av om det er gule poster eller `linkedOnlyNotes`).
     - Legg til en `concerns`-note: "Tilknyttet utstyr/tilbehør har rød status, men er ikke valgt på oppdraget — antas ikke brukt. Ingen hard stop."
   - Den eksisterende deterministiske vakten kjører deretter som før og kan re-aktivere hard stop hvis det faktisk finnes røde forhold på valgte ressurser.

3. **Konklusjon/hard_stop_reason tekst:** Ingen endring i format (overordnet kort tekst, detaljer i utstyrsseksjonen — som tidligere bestemt).

## Ingen DB-endringer

Ren edge-function-endring.
