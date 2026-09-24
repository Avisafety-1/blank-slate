# Risikovurdering for fløyne oppdrag i Status

## Endringer
- Erstatt «Oppdrag per risikonivå» med en fordeling av fløyne oppdrag etter siste lagrede risikovurdering: Go, Caution, No-Go og Ikke vurdert.
- Regn et oppdrag som flydd når det har minst én tilknyttet flylogg i valgt periode, og tell hvert oppdrag bare én gang selv om det har flere flylogger.
- Bruk siste risikovurdering per oppdrag. Vis lagret totalscore på skalaen 1–10 og bruk de etablerte grensene: Go 7,0–10,0, Caution 5,0–6,9 og No-Go under 5,0 eller lagret No-Go-anbefaling.
- Bruk grønn, gul, rød og grå farge i grafen, med eksakte antall og tydelige intervaller. «Ikke vurdert» dekker fløyne oppdrag uten lagret vurdering.
- Oppdater samme datagrunnlag og betegnelser i statusvisningen, PDF, CSV og Excel, slik at eksportene samsvarer med skjermen.
- Legg alle nye brukertekster i både norsk og engelsk språkfil.

## Teknisk
- Hent unike `mission_id` fra `flight_logs` innen valgt periode, hent tilhørende vurderinger sortert nyeste først, og velg én vurdering per oppdrag.
- Behold eksisterende tilgangsstyring. Ingen databaseendringer er nødvendige.
- La lagret `recommendation = no-go` overstyre poengintervallet, slik at hard-stop-resultater ikke feilklassifiseres.

## Kontroll
- Kontroller Go/Caution/No-Go-grensene, hard-stop/No-Go og «Ikke vurdert» med representative data.
- Bekreft at flere flylogger for samme oppdrag ikke dobbelttelles, og at ikke-fløyne oppdrag utelates.
- Kontroller skjerm, PDF, CSV og Excel på norsk og engelsk.
- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
