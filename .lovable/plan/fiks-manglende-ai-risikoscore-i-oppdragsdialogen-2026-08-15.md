# Fiks: manglende AI-risikoscore i oppdragsdialogen

## Hva som faktisk skjer

Oppdraget «Hide test» har tre risikovurderinger i databasen — den nyeste fra 15.08.2026 med score 5.0 (caution). Status «Fullført» er ikke årsaken.

Årsaken er hvor dialogen åpnes fra:

- På /oppdrag hentes siste risikovurdering sammen med oppdragslisten og henges på oppdraget som `aiRisk`. Derfor viser kortet riktig score.
- Oppdragsdialogen (MissionDetailDialog) leser bare `mission.aiRisk` fra objektet den får inn. Dashbordlisten setter dette, men alle andre steder som åpner samme dialog — Avvik/Hendelser, Kart, Kalender, Status, Profil, Aktive flygninger, tidslinje, AI-søk — sender inn et oppdrag uten `aiRisk`. Da faller badgen tilbake til den nøytrale «Risiko»-teksten, slik skjermbildet viser.

## Løsning

Gjør dialogen selvforsynt i stedet for å fikse hvert enkelt kallsted:

- Når dialogen åpnes og oppdraget mangler `aiRisk`, henter dialogen selv nyeste rad fra risikovurderingene for det oppdraget og bruker den i badge-raden.
- Samme fallback for SORA-data, slik at SORA-badgen også blir riktig uansett hvor dialogen åpnes fra.
- Hvis oppdraget allerede har dataene med seg (dashbord/oppdragsliste), brukes de som før — ingen ekstra spørring.
- Etter at en ny risikovurdering kjøres fra dialogen, oppdateres badgen.

## Teknisk

- `src/components/dashboard/MissionDetailDialog.tsx`: legg til en liten henting (mission_risk_assessments sortert på created_at synkende, limit 1, og mission_sora for oppdraget) som kjører når dialogen er åpen og feltene mangler på mission-objektet. Resultatet brukes i `MissionBadgeRow` og for å velge riktig fane (`history` vs `input`) ved klikk på risiko-badgen.
- Ingen databaseendringer.
