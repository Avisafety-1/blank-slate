# Egne seksjoner for luft- og bakkerisiko + foreløpig SORA-konklusjon

## Hva som endres

1. **Luftrisikoanalyse flyttes ut av «Luftrom»**
   Seksjonen ligger i dag inne i den ekspanderbare «Luftrom»-kategorien. Den flyttes ut som et eget kort på samme nivå som kategoriene, plassert under «Oppdragskompleksitet». Den beholder sin egen ekspanderbare meny.

2. **Bakkerisikoanalyse flyttes ut av «Oppdragskompleksitet»**
   Samme grep: eget kort på toppnivå, rett etter luftrisikoanalysen. Beholder redigerbare mitigeringer og «Overstyrt»-taggen.

   Ny rekkefølge:

   ```text
   Vær / Luftrom / Utstyr / Piloterfaring / Oppdragskompleksitet
   ── Luftrisikoanalyse (ekspanderbar)
   ── Bakkerisikoanalyse (ekspanderbar)
   ── Foreløpig konklusjon (ny)
   ── Lagre kommentarer / Eksporter til PDF
   ```

3. **Ny seksjon «Foreløpig konklusjon»**
   Plasseres der den røde streken er tegnet — mellom bakkerisikoanalysen og knappene. Viser tre tydelige badges:
   - **ARC** (residual ARC fra luftrisikoanalysen, med initial ARC vist om den er redusert)
   - **fGRC** (etter aktive mitigeringer)
   - **SAIL** (utledet fra fGRC + ARC via SORA-matrisen)

   Under badgene en kort merknad: «Foreløpig konklusjon. Mitigeringene under bakkerisikoanalysen kan endres manuelt, og SAIL oppdateres automatisk.» Hvis mitigeringene er manuelt overstyrt vises «Overstyrt»-taggen også her. Mangler grunnlag for en verdi vises «–».

## Teknisk

- `src/components/dashboard/RiskScoreCard.tsx`: flytt `AirRiskAnalysisSection` og `GroundRiskAnalysisSection` ut av `CollapsibleContent` i kategorimappingen og render dem etter kategorilisten.
- Ny komponent `src/components/dashboard/PreliminaryConclusionSection.tsx` som tar `airRiskAnalysis` og `groundRiskAnalysis` og regner SAIL.
- SAIL-matrisen som i dag ligger lokalt i `SoraResultView.tsx` løftes ut til en delt helper (`src/lib/soraSail.ts`) slik at både resultatvisningen og den nye seksjonen bruker samme kilde.
- SAIL regnes ut på nytt når mitigeringene endres, siden fGRC allerede oppdateres live via `recomputeGroundRisk`.
- Nye i18n-nøkler i `no.json` og `en.json` (tittel, ARC/fGRC/SAIL-etiketter, merknad om manuelle mitigeringer).
