# Riktig AEC + manuell ARC-reduksjon (SORA Annex C)

## Problemet

AEC-tabellen som brukes i AI-risikovurderingen stemmer ikke med JARUS SORA Annex C, Tabell 1. Dagens tabell mapper AEC-numrene til feil miljøer — blant annet brukes «AEC 11» for klasse G under 500 ft i urbant område, mens AEC 11 i Annex C er operasjoner **over FL600**. Derfor får vanlige lavtflyvende oppdrag feil AEC (og dermed feil begrunnelse for iARC).

I tillegg finnes det i dag ingen måte å manuelt sette eller redusere ARC på, selv om Annex C Tabell 2 tillater reduksjon når operatøren kan dokumentere lavere lokal lufttrafikktetthet.

## Del 1: Riktig AEC-tabell (Annex C Tabell 1)

Erstatter tabellen i AI-prompten (norsk + engelsk) med korrekt versjon:

```text
Miljø                                              Tetthet  AEC     iARC
Flyplass/heliport i klasse B, C eller D              5      AEC 1   ARC-d
Flyplass/heliport i klasse E, F eller G              3      AEC 6   ARC-c
>500 ft AGL, <FL600, Mode-S Veil / TMZ               5      AEC 2   ARC-d
>500 ft AGL, <FL600, kontrollert luftrom             5      AEC 3   ARC-d
>500 ft AGL, <FL600, ukontrollert, urbant            3      AEC 4   ARC-c
>500 ft AGL, <FL600, ukontrollert, landlig           2      AEC 5   ARC-c
<500 ft AGL, Mode-S Veil / TMZ                       3      AEC 7   ARC-c
<500 ft AGL, kontrollert luftrom                     3      AEC 8   ARC-c
<500 ft AGL, ukontrollert, urbant                    2      AEC 9   ARC-c
<500 ft AGL, ukontrollert, landlig                   1      AEC 10  ARC-b
>FL600                                               1      AEC 11  ARC-b
Atypisk/segregert luftrom                            1      AEC 12  ARC-a
```

Det legges også inn en deterministisk etterkontroll i backend: når vi kjenner luftromsklasse, høyde, flyplassnærhet og befolkningstetthet fra oppdraget, korrigeres AEC og iARC til riktig rad selv om AI-modellen bommer. En typisk norsk VLOS-operasjon under 500 ft i ukontrollert luftrom over landlig område blir da AEC 10 / ARC-b, og urbant blir AEC 9 / ARC-c.

## Del 2: Manuell ARC-reduksjon i UI

I «Luftrisikoanalyse (ARC/TMPR)» kommer en ny redigerbar del, bygget etter samme prinsipp som mitigeringene under bakkerisiko:

- Viser AEC, generalisert tetthetsrating (kolonne A) og iARC (kolonne B) som fast utgangspunkt.
- Bruker kan velge hvilken lokal tetthet som kan dokumenteres (kolonne C). Kun de valgene Annex C Tabell 2 tillater for gjeldende AEC er klikkbare; resten vises som ikke tilgjengelige.
- Resulterende residual-ARC (kolonne D) beregnes umiddelbart.

Tillatte reduksjoner (Tabell 2):

```text
AEC        A   iARC    Dokumentert lokal tetthet   → residual ARC
AEC 1/2    5   ARC-d   4 eller 3                     ARC-c
                       2 eller 1                     ARC-b
AEC 3      4   ARC-d   3 eller 2                     ARC-c
                       1                             ARC-b
AEC 4      3   ARC-c   1                             ARC-b
AEC 5      2   ARC-c   1                             ARC-b
AEC 6/7/8  3   ARC-c   1                             ARC-b
AEC 9      2   ARC-c   1                             ARC-b
AEC 10/11  —   —       ingen reduksjon i tabellen    (kun ARC-a via atypisk/segregert)
AEC 12     1   ARC-a   —                             —
```

Regler som håndheves og forklares i UI:

- Referansemiljøet for tetthetsvurdering er alltid AEC 10 (under 500 ft over landlig område) — vises som hjelpetekst.
- AEC 10 og AEC 11 kan ikke reduseres via tabellen. Reduksjon til ARC-a er et eget valg som krever at alle krav til atypisk/segregert luftrom (Annex G 3.20(d)) er oppfylt — det valget får en egen bekreftelse med kravtekst.
- Reduksjon krever begrunnelse: et tekstfelt for dokumentasjon av lokal tetthet, og en påminnelse om at reduksjonen må godkjennes av myndighet (Luftfartstilsynet).
- Egen «Overstyrt»-tagg på statuslinjen når ARC er manuelt satt, likt bakkerisiko.

Residual-ARC fra brukerens valg mates rett inn i «Foreløpig konklusjon», så SAIL oppdateres automatisk, og sendes med til backend ved SORA re-vurdering slik at AI-en ikke overskriver valget.

## Teknisk

- Ny `src/lib/soraAirRisk.ts`: `AEC_TABLE` (Annex C Tabell 1), `ARC_REDUCTION_TABLE` (Tabell 2), `deriveAec(input)` for deterministisk AEC-utledning og `allowedArcReductions(aec)`.
- `supabase/functions/ai-risk-assessment/prompts.ts`: korrigert AEC-tabell i både norsk og engelsk prompt, samt oppdaterte regler for strategiske mitigeringer/ARC-reduksjon.
- `supabase/functions/ai-risk-assessment/index.ts`: deterministisk AEC/iARC-overstyring etter AI-svar (samme mønster som `buildDeterministicGroundRisk`), og støtte for `manualAirRisk` i request-body slik at manuell residual-ARC beholdes og brukes i SAIL-oppslaget.
- `src/components/dashboard/AirRiskAnalysisSection.tsx`: nye props `editable` og `onChange`, valgknapper for lokal tetthet, ARC-a-bekreftelse, begrunnelsesfelt, `arc_manual_override`-tagg.
- `src/components/dashboard/RiskScoreCard.tsx` og `RiskAssessmentDialog.tsx`: ny `onAirRiskChange` som lagrer til `ai_analysis.air_risk_analysis` og sender `manualAirRisk` ved re-vurdering.
- `PreliminaryConclusionSection.tsx`: bruker residual-ARC inkl. manuell overstyring.
- Nye i18n-nøkler under `riskAssessment.air.*` i både `no.json` og `en.json`.
