# Direkte til risikovurdering + automatiske mitigeringer

## 1. Fjern mellomsteget «Velg type risikovurdering»

Når «Ny risikovurdering» klikkes fra oppdragskortet/oppdragsdialogen åpnes AI-risikovurderingen direkte på Input-fanen. Manuell SORA er fortsatt tilgjengelig som egen fane i samme dialog, så ingen funksjonalitet forsvinner.

- `MissionDetailDialog.tsx` og `OppdragDialogs.tsx`: knappen setter `initialTab='input'` og åpner `RiskAssessmentDialog` uten `RiskAssessmentTypeDialog`.
- `RiskAssessmentTypeDialog.tsx` fjernes fra bruk (filen kan bli stående ubrukt, eller slettes).

## 2. Ny seksjon på Input-fanen: «Mitigeringer som blir tatt med»

Under flygeparametrene vises en live oppsummering av hvilke reduksjoner systemet vil kreditere, oppdatert mens man endrer input. Hvert punkt viser mitigering, robusthet og reduksjon (f.eks. «M1(C) Bakkeobservasjon — Lav, −1»), samt hvorfor den gis eller ikke gis.

Automatiske kriterier som foreslås:

| Mitigering | Utløses av | Robusthet/reduksjon |
|---|---|---|
| M1(C) Bakkeobservasjon | Antall observatører ≥ 1 (og VLOS eller observatør oppgitt i BVLOS) | Lav, −1 |
| M2 Redusert treffenergi | Oppdraget har tilknyttet utstyr med fallskjerm/MoC 2512 | Middels, −1 |
| M2 Redusert treffenergi | Utstyr dokumentert med DVR / design verification | Høy, −2 |
| M1(A) Skjerming | Ikke automatisk (krever dokumentasjon) | — |
| M1(B) Operasjonelle restriksjoner | Ikke automatisk (krever 90–99 % dokumentert reduksjon) | — |

Luftrisiko (vises i samme liste som informasjon):
- Atypisk/segregert luftrom er kun aktivt når operatøren huker det av — ingen endring, men det vises i lista slik at man ser at det påvirker ARC.

Alt kan fortsatt overstyres manuelt i resultatet; manuelle valg vinner over automatikk som i dag.

## 3. Kreditér M1(C) automatisk i beregningen

I dag krediteres bare M2 automatisk; observatører gir ingen reduksjon før man overstyrer manuelt. Endringen gjør at antall observatører sendes inn i den deterministiske bakkerisikoberegningen og gir M1(C) Lav (−1) når minst én observatør er satt. Begrunnelsesteksten endres tilsvarende («Kreditert basert på N oppgitt observatør(er) …»), og fGRC/SAIL beregnes med denne reduksjonen. M1-grensen (kontrollert bakkeområde) håndheves som før.

Merk: etter SORA krever M1(C) dokumentert bakkebasert observasjon av overflyst område. Teksten i vurderingen vil derfor si eksplisitt at krediteringen bygger på operatørens oppgitte observatører og må kunne dokumenteres.

## Teknisk

- `supabase/functions/ai-risk-assessment/index.ts`: `buildDeterministicGroundRisk` får `observerCount` (og `flightMode`), auto-utleder `m1c_ground_observation`; manuelle overstyringer har fortsatt forrang. Ny/oppdatert begrunnelsestekst på no/en. Funksjonen redeployes.
- Ny komponent `src/components/dashboard/AutoMitigationsPreview.tsx` med delt hjelpefunksjon (f.eks. `src/lib/soraAutoMitigations.ts`) som frontend og edge-funksjonen bruker samme regler fra, slik at forhåndsvisningen alltid matcher resultatet.
- `RiskAssessmentDialog.tsx`: henter tilknyttet utstyr for oppdraget (`mission_equipment`) for forhåndsvisningen og rendrer den nye seksjonen på Input-fanen.
- Alle nye strenger legges i `no.json` og `en.json`.
