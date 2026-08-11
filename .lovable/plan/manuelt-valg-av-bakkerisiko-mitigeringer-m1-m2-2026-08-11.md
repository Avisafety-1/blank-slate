# Manuelt valg av bakkerisiko-mitigeringer (M1/M2)

I AI-risikovurderingen skal bakkerisikoanalysen bli interaktiv: brukeren kan selv slå mitigeringer av/på og velge robusthetsnivå der SORA-tabellen tillater det. Reduksjonen beregnes umiddelbart, fGRC oppdateres, og verdiene brukes videre ved SORA re-vurdering og SAIL-oppslag.

## Hva som bygges

1. **Interaktiv mitigeringsliste** i seksjonen "Bakkerisikoanalyse (iGRC/fGRC)":
   - Hver mitigering (M1(A), M1(B), M1(C), M2) får en av/på-bryter og et robusthetsvalg (None / Low / Medium / High).
   - Nivåer som ikke er tillatt for kategorien vises som "N/A" og kan ikke velges, etter SORA-tabellen:

```text
Mitigering                          None   Low   Medium   High
M1(A) Skjerming                       0     -1     -2      N/A
M1(B) Operasjonelle restriksjoner     0     N/A    N/A     N/A
M1(C) Bakkeobservasjon                0     -1     N/A     N/A
M2  Redusert treffenergi              0     N/A    -1       -2
```

2. **Automatisk beregning**: sum av valgte reduksjoner vises live, og fGRC = iGRC + sum, med gulvet på kontrollert-bakkeområde-verdien (samme regel som i dag). AI-ens opprinnelige begrunnelse beholdes, men verdiene merkes som "manuelt justert" når brukeren har overstyrt.

3. **Lagring**: valgene lagres på risikovurderingen, slik at de er der neste gang dialogen åpnes og ved eksport til PDF.

4. **Brukes videre**: ved "SORA re-vurdering" sendes de manuelle mitigeringsvalgene med til backend. Backend bruker den manuelt justerte fGRC-en i SAIL-oppslaget (fGRC × ARC-matrisen), slik at SAIL følger brukerens valg i stedet for kun automatisk kredittering.

5. **Full i18n** (no/en) på alle nye etiketter, robusthetsnivåer og hjelpetekster.

## Teknisk

- `src/components/dashboard/GroundRiskAnalysisSection.tsx`: fra ren visning til redigerbar liste. Ny matrise-konstant for tillatte robusthetsnivåer per mitigering, `Switch` + `Select` per rad, live-beregnet totalreduksjon og fGRC, `onChange`-callback opp til forelder.
- `src/components/dashboard/RiskScoreCard.tsx`: sender ned `onGroundMitigationsChange` og `editable`-flagg.
- `src/components/dashboard/RiskAssessmentDialog.tsx`: eier tilstanden, lagrer den til `mission_risk_assessments.ai_analysis.ground_risk_analysis` (oppdaterer `mitigations`, `total_reduction`, `fgrc`, `manual_override: true`) via en `update` på gjeldende vurdering, og sender `manualGroundMitigations` i kroppen til `ai-risk-assessment` ved re-vurdering.
- `supabase/functions/ai-risk-assessment/index.ts`: `buildDeterministicGroundRisk` tar imot valgfrie manuelle overstyringer; overstyrt fGRC brukes i den deterministiske SAIL-oppslagslogikken. Ingen skjemaendring i databasen (alt ligger i eksisterende JSON-felt).
- `src/lib/riskAssessmentPdfExport.ts`: viser valgt robusthet og reduksjon per mitigering, og markerer manuelle overstyringer.
- Nye nøkler i `no.json` og `en.json` under `riskAssessment.ground.*`.
