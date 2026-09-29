# BVLOS-kompetanse som forutsetning, ikke krav – og fjerne «r4»

## Hvorfor det fortsatt skjer

Forrige endring la bare inn en instruks til AI-en. Systemet sender likevel fortsatt kompetansestatusen «uavklart» for BVLOS, og alle utløpte kompetanserader går til AI-en med sitt rå navn eller en intern kode. AI-en velger da selv å lage røde advarsler, blant annet om «r4». En instruks alene er ikke nok. Utfallet må styres av systemet.

## Endringer

1. **BVLOS er alltid «forutsetning» og aldri «uavklart».** For BVLOS under SORA gir kompetansesjekken nå en egen status: «forutsatt iht. operasjonsmanual». Den gir aldri advarsel og aldri no-go. Det kreves ingen dokumentasjon.
2. **Systemet skriver selv den gule merknaden.** Etter at AI-en har svart, fjerner vi AI-ens egne punkter om BVLOS-/OSO-kompetanse fra pilotkategorien. I stedet legges én fast gul merknad inn: «Forutsetter opplæring og godkjenning ihht. selskapets operasjonsmanual / SORA.» (engelsk tilsvarende).
3. **Ingen interne koder i teksten.** Punkter som inneholder «r4», «rank», «uavklart», «undetermined» eller «OSO #08-analyse» fjernes automatisk fra pilotpunktene, oppsummeringen og anbefalingene.
4. **Utløpte kompetanser.** AI-en får bare utløpte droneførerbevis som systemet gjenkjenner, med lesbart navn (f.eks. «A2 (utløpt 2025-03-01)»). Andre utløpte rader, som interne kurs og ukjente koder, sendes ikke med. Da kan de ikke gi røde advarsler.
5. **Scoren påvirkes ikke** av BVLOS-kompetanse.

Risikovurderinger som allerede er laget, endres ikke. Kjør vurderingen på nytt for å se endringen.

## Teknisk

- `competency.ts`: legg `'assumed'` til i `CompetencyStatus` og `coveredBy: 'operations_manual'`. BVLOS-grenen returnerer alltid `assumed` når den ikke er `ok`. `undeterminedWhy: 'bvlos_specific_oso08'` fjernes.
- `index.ts`: `expiredCompetencies` i `pilotStats` erstattes med `competencyAssessment.expired`, filtrert til gjenkjente koder. `unclassified` sendes ikke for BVLOS. Etter AI-svaret gjør en ny `sanitizeCompetencyText()` følgende i `categories.pilot_experience` (concerns/factors), `summary` og `recommendations`: fjerner setninger som matcher `/\br\s?4\b|rank|undetermined|uavklart|OSO\s*#?0?8/i` og BVLOS-kompetansepunkter, og legger deretter inn den faste gule merknaden (samme kategori og format som eksisterende advarsler i pilotkategorien).
- `prompts.ts` (NO/EN): beskriv `assumed` som en ren forutsetning som ikke skal kommenteres utover den faste merknaden.
- `competency_test.ts`: BVLOS uten sertifikat gir `assumed`, og utløpte ukjente rader tas ikke med.
- Deploy `ai-risk-assessment`, kjør Deno-testene og `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
