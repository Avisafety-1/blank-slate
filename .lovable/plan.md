## Problem

I SORA-resultatet kan AI returnere et `sail`-felt (f.eks. "SAIL IV") som ikke samsvarer med oppslaget i fGRC × ARC-matrisen (f.eks. fGRC 4 + ARC B → III). Matrisen vises riktig i UI, men `sail` og `sail_lookup.result` kommer fra AI-en og kan avvike. Det samme gjelder `containment.robustness_level` som avledes fra SAIL.

## Løsning

Beregn SAIL deterministisk fra matrisen etter at AI har returnert sin analyse, og overstyr AI-feltene. Da blir resultatet alltid konsistent med tabellen — uavhengig av hva modellen sier.

## Endringer

### 1. `supabase/functions/ai-risk-assessment/index.ts`

Etter at `soraAnalysis` er parset fra AI-svaret (rundt linje 560–630), legg til en post-processing-blokk som:

- Leser endelig `fgrc` (fra `sail_lookup.fgrc_used` hvis satt, ellers `soraAnalysis.fgrc`).
- Leser residual ARC (fra `sail_lookup.arc_used` hvis satt, ellers `soraAnalysis.arc_residual`).
- Slår opp SAIL i samme matrise som UI-en bruker:
  ```
  fGRC ≤2: A=I, B=II, C=IV, D=VI
  fGRC 3 : A=II, B=II, C=IV, D=VI
  fGRC 4 : A=III, B=III, C=IV, D=VI
  fGRC 5 : A=IV, B=IV, C=IV, D=VI
  fGRC 6 : A=V, B=V, C=V, D=VI
  fGRC 7+: A=VI, B=VI, C=VI, D=VI
  ```
- Overstyrer `soraAnalysis.sail` til `"SAIL <romertall>"` og `soraAnalysis.sail_lookup.result` til romertallet.
- Re-utleder `soraAnalysis.containment.robustness_level` fra SAIL (I–II → Low, III–IV → Medium, V–VI → High) hvis containment-objektet finnes.
- Hvis fGRC/ARC ikke kan tolkes, logger advarsel og lar AI-verdien stå.

Beregningen plasseres i en liten hjelpefunksjon `deriveSailFromMatrix(fgrc, arc)` i samme fil (eventuelt i en ny `sora.ts` ved siden av `prompts.ts` — valg av plassering er detalj).

### 2. `src/components/dashboard/SoraResultView.tsx` (defense in depth)

I `SailMatrixTable`/visningen, hvis `sail_lookup.fgrc_used` og `sail_lookup.arc_used` finnes, vis `SAIL_MATRIX[row][col]` som "SAIL-resultat" i stedet for `sail_lookup.result`. Dette sikrer at gamle, allerede lagrede vurderinger også vises korrekt uten ny AI-kjøring. `data.sail`-badgen kan også overstyres med matrise-resultatet når fGRC/ARC er kjent.

## Hva som ikke endres

- Selve AI-prompten beholdes som den er — vi stoler bare ikke blindt på SAIL-feltet i output.
- Eksisterende lagrede `risk_assessments`-rader migreres ikke; de vil få korrekt visning via punkt 2, og korrekt lagret verdi neste gang vurderingen kjøres på nytt.
- Ingen DB-endringer.

## Teknisk

- Filer: `supabase/functions/ai-risk-assessment/index.ts`, `src/components/dashboard/SoraResultView.tsx`.
- Matrise er identisk med `SAIL_MATRIX` i `SoraResultView.tsx` — kopieres til edge function (kan ikke importeres på tvers av frontend/Deno).
