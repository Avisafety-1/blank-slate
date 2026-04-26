Plan:

1. Slutt å opprette automatisk SORA-PDF som dokument
- Fjerne kallene som genererer og laster opp `SORA beregningsgrunnlag` som PDF ved lagring av oppdrag/rute.
- Beholde selve beregningsgrunnlaget i `missions.route`, fordi det allerede oppdateres når ruten lagres på nytt.
- Fjerne den interne `_createSoraDocumentation`-flaggen fra lagringsflyten slik at den ikke brukes til dokumentoppretting.

2. Lag en felles tekstvisning for SORA buffer og tilstøtende områder
- Opprette en liten gjenbrukbar komponent, f.eks. `MissionSoraRouteDocumentation`, som leser fra `mission.route.soraSettings` og `mission.route.adjacentAreaDocumentation`.
- Vise den som en ekspanderbar seksjon med tittel som f.eks. `SORA buffer og tilstøtende områder`.
- Innhold ved SORA volum:
  - Flight Geography
  - Contingency buffer
  - Contingency høyde
  - Ground Risk Buffer
  - Flyhøyde
  - Buffermodus
  - Drone/CD/V0 hvis lagret
- Innhold ved tilstøtende områder:
  - Tilstøtende radius
  - Areal
  - Innbyggere funnet
  - Gjennomsnittlig tetthet
  - Grense/kategori
  - UA Size
  - SAIL
  - Outdoor assemblies
  - Required containment
  - Resultat/status
  - Beregnet tidspunkt
- Dersom bare én av funksjonene er brukt, vises bare den relevante delen.

3. Plasser seksjonen nederst på oppdraget
- På oppdragskort/listen: legge inn en kompakt ekspanderbar rad nederst på hvert oppdragskort når ruten har SORA- eller tilstøtende-data.
- I oppdragsdetaljdialogen: legge inn samme seksjon nederst i dialogen, etter eksisterende innhold/kommentarer, så brukeren kan se hele beregningsgrunnlaget uten å åpne dokumenter.
- Stoppe klikk-bobling på ekspander-knappen slik at man ikke utilsiktet åpner hele oppdraget når man bare vil utvide beregningsgrunnlaget i kortet.

4. Sørg for at redigering av rute oppdaterer verdiene
- Når ruten redigeres og lagres fra kartet, lagres ny `soraSettings` og ny `adjacentAreaDocumentation` direkte på `missions.route`.
- Dersom SORA/tilstøtende er slått av ved ny lagring, fjernes de relevante lagrede feltene fra ruten.
- Oppdragslisten/detaljdialogen refresher allerede etter lagring; seksjonen vil derfor vise siste lagrede verdier.

5. Ta med ny funksjon i oppdragseksport til PDF
- Utvide eksisterende `src/lib/oppdragPdfExport.ts` slik at `sections.sora` også inkluderer ruteplanens SORA buffer-/tilstøtende-grunnlag.
- Legge dette inn som en tabell i oppdragsrapporten, uavhengig av om oppdraget også har en manuell SORA-analyse i `mission_sora`.
- Bruke samme label-logikk som i UI for UA Size, tetthetskategori og outdoor assemblies.

Tekniske detaljer:
- Berørte filer sannsynligvis:
  - `src/pages/Kart.tsx`
  - `src/components/dashboard/AddMissionDialog.tsx`
  - `src/components/dashboard/MissionsSection.tsx`
  - `src/components/dashboard/MissionDetailDialog.tsx`
  - `src/lib/oppdragPdfExport.ts`
  - ny komponent, f.eks. `src/components/dashboard/MissionSoraRouteDocumentation.tsx`
- `src/lib/soraDocumentationPdf.ts` kan stå ubrukt eller fjernes. Jeg anbefaler å fjerne/avkoble den fra flyten nå, siden ønsket funksjon ikke lenger skal opprette dokumenter.
- Ingen databaseskjemaendring er nødvendig, fordi dataene allerede kan lagres på `missions.route` som JSON.
- Eksisterende dokumenter som allerede er opprettet tidligere slettes ikke automatisk; dette unngår utilsiktet datatap. Nye oppdrag/ruteendringer vil ikke opprette nye SORA-PDF-dokumenter.