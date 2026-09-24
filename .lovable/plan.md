# Forbedret PDF-rapport fra Statistikk

## Mål
Lage en kortere, mer komplett og tydelig statusrapport som bruker hele A4-bredden, uten AI-vurdering. AviSafe-logoen plasseres i toppen av førstesiden sammen med selskap, valgt periode og genereringstidspunkt.

## Innhold som skal med
Rapporten skal gjenspeile faktagrunnlaget som allerede finnes på `/status`:

- Nøkkeltall: totale og fullførte oppdrag, fullføringsgrad, flytimer, hendelsesfrekvens, aktive ressurser og planlagte/ikke-planlagte importerte flyturer med prosentandel.
- Oppdrag: utvikling per måned, statusfordeling og risikonivå.
- Operasjonstyper: VLOS/BVLOS/EVLOS fordelt på antall, flytimer og måned.
- Ikke-planlagte flyturer: månedlig sammenligning mellom planlagt og ikke planlagt, med samme forklaring som på statussiden.
- Hendelser: utvikling per måned, hovedårsaker, medvirkende årsaker, alvorlighetsgrad og dager siden siste alvorlige hendelse.
- Ressurser og dokumentasjon: drone- og utstyrsstatus, flytimer for de ti mest brukte dronene og dokumenter som utløper innen 30, 60 og 90 dager.
- Avvik: sammendrag, hovedkategorier og detaljtabell når avviksrapportering er aktivert og perioden inneholder avvik.

AI-analysen fra statussiden skal ikke tas med.

## Ny rapportstruktur
- Bruk A4 liggende for å utnytte bredden.
- Førsteside: AviSafe-logo, rapporttittel, selskap, periode og genereringstidspunkt, etterfulgt av nøkkeltall i et kompakt rutenett.
- Plasser to eller tre mindre grafer side om side der datamengden tillater det.
- La brede månedsserier bruke full bredde, mens fordelingsgrafer og korte tabeller deler rad.
- Bruk faste seksjonshøyder og sidebrudd før innhold kan kollidere eller deles uheldig.
- Legg sidenummer og rapportidentitet i en diskret bunntekst på alle sider.
- Behold lesbare forklaringer, aksetekster og tegnforklaringer også når grafene står side om side.

## Datakvalitet og konsistens
- Rett dokumentutløpsberegningen slik at de beregnede 30/60/90-dagstallene faktisk lagres og kommer med i rapporten; dagens funksjon beregner tallene, men oppdaterer ikke visningen.
- Bruk én felles samling av rapportdata for skjermens statistikk og PDF-en, slik at tall og perioder ikke avviker.
- Kontroller at egendefinert periode vises med faktiske fra-/til-datoer i rapporthodet, ikke som «siste år».
- Bruk korrekt språk og datoformat for valgt språk i stedet for å låse PDF-en til norsk.
- Vis «Ingen data» i tomme seksjoner fremfor å utelate dem på en måte som kan misforstås.

## Teknisk gjennomføring
- Trekk PDF-byggingen ut av `Status.tsx` til en egen eksportmodul for enklere vedlikehold og testing.
- Gjenbruk den eksisterende AviSafe-logoen som en lokal bildefil og last den inn før PDF-en bygges; ingen ekstern bildeadresse.
- Lag gjenbrukbare funksjoner for rapporthode, KPI-rutenett, liggende grafer, tabeller, sidebrudd og bunntekst.
- Utvid norske og engelske oversettelser for nye rapportoverskrifter, forklaringer, akser og bunntekst.
- Ingen databaseendringer eller nye AI-kall.

## Kontroll
- Sammenlign PDF-tallene mot alle tre fanene på `/status` for måned, kvartal, år og egendefinert periode.
- Test både norsk og engelsk, tomme datasett, lange kategorinavn og flere sider med avviksdetaljer.
- Åpne en generert PDF og kontroller visuelt at logo, grafer, tabeller og sideskift er lesbare uten overlapping.
- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
