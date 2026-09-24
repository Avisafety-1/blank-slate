# Komplett CSV- og Excel-eksport fra Statistikk

## Bekreftet gap
CSV og Excel mangler operasjonstype (VLOS/BVLOS/EVLOS), månedlig planlagt mot ikke planlagt, månedlig avviksfordeling, full kategoriinndeling for avvik og gjennomsnittlig avvik per flytur. Egendefinert periode lagres også feilaktig som «siste år» i dokumentinformasjonen.

## Endringer
- Samle alle eksporttabeller i én felles datastruktur som brukes av både Excel og CSV, slik at formatene alltid får samme innhold.
- Ta med alle tall fra den nye PDF-en: komplette KPI-er, oppdrag, operasjonstype med antall/flytimer/måneder, planlagt mot ikke planlagt per måned, hendelser, ressurser, dokumentutløp og avvik.
- Legge inn avvik per måned, hovedkategori, full kategoriinndeling og detaljrader når avviksrapportering er aktivert.
- Bruke korrekt norsk/engelsk språk, datoformat og faktisk egendefinert periode.
- CSV-felt skal escapes korrekt for semikolon, anførselstegn og linjeskift.
- Excel får lesbare kolonnebredder og tydelige overskrifter, uten å endre datagrunnlaget.
- Ingen databaseendringer eller AI-innhold.

## Kontroll
- Kontrollere at CSV og Excel inneholder samme seksjoner og radverdier.
- Åpne en prøvearbeidsbok og kontrollere ark, kolonner og data visuelt.
- Kontrollere CSV-maskinelt for riktig antall kolonner og korrekt håndtering av kommentarer.
- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
