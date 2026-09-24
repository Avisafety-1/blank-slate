# Enkel, godtroende pilotkompetanse-sjekk i risikovurderingen

## Prinsipp

Dagens skjønnsmessige AI-vurdering av pilotkompetanse byttes med en enkel, deterministisk sjekk: pilotens rang på en fast kompetansestige mot rangen som dronens C-klasse (og evt. BVLOS) krever. Målet er færrest mulig unødvendige no-go, samtidig som reelle lovpålagte krav håndheves.

Dagens situasjon (bekreftet): eneste harde regel er «null gyldige rader = no-go», der også kursmoduler og veiledet tour teller. Alt annet vurderes fritt av AI-en.

## 1. Rangstige for personlig kompetanse

Høyere dekker automatisk lavere:

| Rang | Kode |
| --- | --- |
| 1 | A1/A3 |
| 2 | A2 |
| 3 | STS-01 |
| 4 | STS-02 |

- Effektiv rang = høyeste gyldige kode piloten har. Utløpt teller ikke; uten dato regnes som gyldig.
- Gjenkjenning av skrivevarianter: «A1A3», «A1, A3», «A1/A3 drone», «A1/A3, A2», «A1/A3 A2 STS» osv. Ren «STS» uten nummer tolkes som STS-01 (rang 3).
- Teller: Sertifikat, Lisens, Godkjenning, Kompetanse, Utdanning, og Kurs når navnet gjenkjennes som en av kodene over.
- Teller ikke: AviSafe-kursmoduler og veiledet tour — vises som «teller ikke som formell kompetanse».
- Instruktør og bemannet flysertifikat: kun tilleggsinfo.

## 2. Krevd rang

- C0, C1, C3, C4: rang 1.
- C2: rang 2 kun når operasjonen er nær uinvolverte/bebygd (eksisterende valg «befolket» eller «folkemengde» i risikovurderingen), ellers rang 1.
- BVLOS: rang 4, med mindre en gyldig operatørgodkjenning dekker operasjonen.
- C3/C4 kobles aldri til A2-krav.

## 3. Operatørgodkjenning (egen sjekk)

Det finnes i dag ikke et eget felt for operatørgodkjenning på selskapet. Godkjenningen gjenkjennes derfor fra registrerte godkjenninger med tekst som RO1/RO2/RO3, LT, «operatørgodkjenning» eller «driftstillatelse» (finnes allerede i data, f.eks. «Operatør godkjenning LT», «RO2/RO3»). Gyldig (ikke utløpt) godkjenning oppfyller BVLOS-kravet uavhengig av pilotens personlige rang, og vises i rapporten som egen kilde.

## 4. Godtroende-regel

Krav oppfylt hvis pilotens rang ≥ krevd rang, eller gyldig operatørgodkjenning dekker operasjonstypen. Ingen andre kryssjekker.

Regelmotoren gir aldri no-go på noe den ikke kan tolke. Da faller vurderingen tilbake til AI som i dag (uten hard stop):
- Kompetanserader som ikke gjenkjennes.
- Drone uten registrert C-klasse (29 droner) eller med C5/C6 (3 droner).

## 5. Hva brukeren ser i rapporten

- Krevd rang (C-klasse + evt. nærhet/BVLOS) mot pilotens effektive rang.
- Om kravet dekkes av operatørgodkjenning, vises det som egen kilde.
- Ved manglende dekning: konkret hard stop-tekst, f.eks. «Dronen er C2 og flys nær uinvolverte, som krever A2; piloten har kun A1/A3, og ingen operatørgodkjenning dekker operasjonen.»
- Ved flere piloter: kravet må dekkes av minst én tildelt pilot.

## 6. Ikke i denne omgang

- Ingen selskapsspesifikk overstyring av kravene.
- Ingen hard stop på uklassifisert eller usikker data.
- Ingen databaseendringer.

## Teknisk

- Ny `supabase/functions/ai-risk-assessment/competency.ts` med rene funksjoner: `classifyCompetency()`, `effectivePilotRank()`, `detectOperatorApproval()`, `requiredRank({ droneClass, proximityToPeople, isVlos })`, `evaluateCompetency()` som returnerer `{ status: 'ok' | 'missing' | 'undetermined', required, pilotRank, coveredBy, ignored, unclassified }`.
- `competency_test.ts` (Deno): C0–C4, C2 med/uten nærhet, BVLOS med/uten godkjenning, utløpt, uten dato, «STS» uten nummer, tour/kurs ignorert, ukjent C-klasse → undetermined.
- `hardStops.ts`: erstatt `validCompetencyCount === 0`-regelen med `status === 'missing'` (kode `pilot_competency_rank`, NO/EN). `pilot_missing` (ingen pilot tildelt) beholdes.
- `index.ts`: kall motoren med `drones.klasse`, `pilotInputs.proximityToPeople` og `isVlos`; send `competencyAssessment` til modellen i stedet for de flate listene.
- `prompts.ts` (NO/EN): fjern punkt 4 i hard stop-listen og STS-02-regelen; ny regel «kompetansesjekken er avgjort når status er ok/missing — gjengi den; bare ved undetermined skal du vurdere selv, og aldri som hard stop».
- Deploy `ai-risk-assessment`; validering med Deno-tester og `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
