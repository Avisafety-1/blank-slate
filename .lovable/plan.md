# Dag-, uke- og månedsvisning i ressurskalenderen

## Mål
La brukeren bytte mellom dag, uke og måned i den eksisterende operative ressurskalenderen uten å endre data, tilgang eller detaljvinduer.

## Dette bygges
- Legge en kompakt visningsvelger for Dag, Uke og Måned i kalenderens verktøylinje.
- Tilpasse forrige/neste og «I dag» til valgt periode.
- Dag viser én tidskolonne, uke viser dagens sju kolonner, og måned viser alle datoene i valgt kalendermåned.
- Filtrere ressursrader, hendelsesplassering, konflikter, dagens markering og nålinje etter den valgte perioden.
- Tilpasse overskrift, tommelding og tilgjengelighetsnavn til valgt visning.
- Beholde zoom, horisontal scrolling, eksisterende datahenting og åpning av oppdrags-/vedlikeholdsdetaljer.

## Avgrensning
- Ingen databaseendringer.
- Ingen endring i oppdrag, vedlikehold eller ressursfordeling.
- Alle nye tekster legges på norsk og engelsk.

## Kontroll
- Kontrollere dag-, uke- og månedsbytte, periodeknapper, hendelsesplassering og mobilbredde.
- Kjøre `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
