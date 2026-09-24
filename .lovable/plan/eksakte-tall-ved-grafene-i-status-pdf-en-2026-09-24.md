# Eksakte tall ved grafene i status-PDF-en

## Endringer
- Beholde grafene, men legge en kompakt tallrad eller tabell i samme grafpanel slik at verdiene kan leses uten å tolke høyde eller areal.
- Oppdrag: vise eksakte månedstall, statustall og risikonivåtall.
- Operasjoner: vise antall og flytimer for VLOS, BVLOS og EVLOS, samt månedstabeller for operasjonstype og planlagt/ikke-planlagt.
- Hendelser: vise eksakte månedstall, alvorlighetsgrader, hovedårsaker og medvirkende årsaker.
- Ressurser: vise eksakte dronestatuser, utstyrsstatuser og flytimer per drone; dokumentutløp er allerede tabell.
- Avvik: beholde KPI-ene og detaljtabellen, og vise eksakte månedstall og kategoritall ved grafene.
- Bruke kompakt skrift og to-kolonners tabeller der det er nødvendig, slik at tallene blir lesbare uten unødvendig flere sider.
- Legge nye overskrifter og enheter i både norsk og engelsk språkfil.

## Kontroll
- Generere prøve-PDF med realistiske lange navn og 12 måneder.
- Kontrollere tekstinnholdet maskinelt for VLOS/BVLOS/EVLOS og øvrige grafverdier.
- Rendere alle sider til bilder og kontrollere visuelt for overlapping, avkuttede tall og sidebrudd.
- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
