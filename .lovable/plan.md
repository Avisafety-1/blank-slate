# SORA re-vurdering skal ta med manuelle overstyringer

Ved «Kjør SORA-basert re-vurdering» blir manuelt overstyrt bakkerisiko (fGRC), manuelt overstyrt luftrisiko (ARC) og den nye SAIL-en ikke konsekvent brukt. Resultatet er at sammendraget og OSO/containment-kravene beskriver andre verdier (f.eks. «fGRC 4, ARC-c, SAIL IV») enn boksene i Foreløpig konklusjon (fGRC 2, ARC-B, SAIL I).

## Hva som er galt

1. **Manuell ARC når ikke frem.** Dialogen sender `manualAirRisk` uten `residual_arc`, mens edge-funksjonen leser nettopp `manualAirRisk.residual_arc` når den skal låse ARC før SAIL-oppslaget. Feltet er alltid tomt, så SAIL beregnes på AI-ens ARC.
2. **Rekkefølge.** Den deterministiske ARC-overstyringen (Annex C tabell 2 / atypisk luftrom) kjøres i luftrisiko-guarden, men SAIL-oppslaget bruker ikke resultatet derfra.
3. **AI-teksten kjenner ikke overstyringene.** Prompten får verken manuelle mitigeringer, manuell tetthetsrating/ARC-erklæring eller resulterende fGRC/ARC/SAIL, så sammendrag, «harde stopp», anbefalte tiltak og OSO-liste skrives ut fra AI-ens egne verdier.

## Endringer

**Frontend – `src/components/dashboard/RiskAssessmentDialog.tsx`**
- Utvid `manualAirRisk`-objektet med `residual_arc`, `initial_arc`, `aec` og `aec_declared_atypical` fra gjeldende luftrisikoanalyse.
- Send også et lite `manualOverrides`-sammendrag: overstyrt fGRC/iGRC, valgte mitigeringer med robusthetsnivå, ARC-status og gjeldende SAIL, slik at funksjonen har fasit uten å måtte utlede den på nytt.

**Edge function – `supabase/functions/ai-risk-assessment/index.ts`**
- Beregn manuell fGRC og manuell ARC (inkl. tetthetsreduksjon og atypisk-erklæring) *før* SAIL-oppslaget, og bruk disse verdiene som eneste kilde til `sail_lookup.fgrc_used` / `arc_used`.
- Etter luftrisiko-guarden: hvis ARC endret seg, kjør SAIL-oppslaget på nytt så `sail`, `sail_lookup`, `containment.robustness_level` og OSO-nivåene følger den låste SAIL-en.
- Behold manuelle felt (`mitigations_manual_override`, `arc_manual_override`, `manual_density_rating`, `arc_a_atypical`, begrunnelser) i lagret analyse etter re-vurdering.

**Prompt – `supabase/functions/ai-risk-assessment/prompts.ts`**
- Legg inn en tydelig seksjon for manuelle overstyringer ved re-vurdering: hvilke mitigeringer operatøren har kreditert med hvilken robusthet, gjeldende iGRC/fGRC, initiell og residual ARC, hvorvidt atypisk luftrom er erklært, og resulterende SAIL.
- Instruer modellen om at disse verdiene er bindende: sammendrag, harde stopp, anbefalte tiltak og OSO-krav skal skrives ut fra dem, og at operatørens begrunnelser skal refereres sammen med brukerkommentarene.

## Verifisering
Kjør en re-vurdering på et oppdrag med manuelle M1/M2-mitigeringer og manuell ARC-reduksjon, og bekreft at sammendragsteksten, SAIL-badgen, containment-nivået og Foreløpig konklusjon viser samme fGRC/ARC/SAIL.
