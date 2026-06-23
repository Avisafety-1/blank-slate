Jeg fant to konkrete ting:

1. Ja: Edge Function må deployes for at endringene skal gjelde i Supabase.
   - De siste kjøringene bruker deployment version 580.
   - Loggene viser ingen `Equipment hard-stop triggered` og ingen `Drone ... beregnet=...`-linje, selv om den nye koden burde logget dette hvis den faktisk beregnet rød status.
   - Det tyder på at deployet funksjon enten ikke har fått siste kode, eller at den nye beregningen ikke leser riktig datafelt.

2. Det er også en logisk feil i dato-/tidsgrunnlaget:
   - Dronen har `neste_inspeksjon = 2026-06-06`.
   - Risikovurderingens oppdrag ser ut til å være datert `2024-10-16`, men vedlikeholdsstatus beregnes mot dagens dato i Edge Function.
   - Hvis UI viser dronen som rød nå, må risikovurderingen bruke samme autoritative status som UI, men den lagrede vurderingen viser fortsatt at AI fikk/brukte grønn.

Plan for å fikse dette:

- Deploy `ai-risk-assessment` Edge Function på nytt med siste kode.
- Stramme inn serverkoden slik at vedlikeholdsstatus alltid logges for primærdrone og tildelte droner, ikke bare når status endrer seg fra DB-status.
- Gjøre vedlikeholds-guard mer robust ved å:
  - beregne rød/gul direkte fra `neste_inspeksjon`, timer, oppdragsintervall, tilbehør og koblet utstyr,
  - sende `statusReasons` også for alle `assignedDrones`, ikke bare `primaryDrone`,
  - sørge for at `mission_risk_assessments.equipment_score`, `recommendation`, `overall_score` og lagret `ai_analysis` får den overstyrte NO-GO-statusen.
- Etter deploy: sjekke Edge Function-loggene for den aktuelle misjonen og verifisere at den skriver en tydelig linje som viser beregnet status for dronen og eventuelt `Equipment hard-stop triggered`.

Dette krever ingen databaseendring.