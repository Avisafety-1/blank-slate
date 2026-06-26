## Endring i `src/pages/Kart.tsx`

I `handleCancelRoute` (linje 471), i `else`-grenen (når man redigerer et eksisterende oppdrags rute via `editingMissionId`), legg til:

- `setEditingMissionId(null)` — fjerner aktivt oppdrag, slik at "Tilbake til oppdrag"-knappen forsvinner.
- `setEditingMissionStatus(null)` — rydder opp tilhørende status.
- Nullstill eventuell initial rute-state (`initialRoute`/lignende) hvis den brukes for å re-fylle ruten ved ny redigering, slik at neste klikk på ruteplanleggeren starter på blank rute.

Resultat: Klikk på "Avbryt" når et oppdrag redigeres tar brukeren tilbake til ren `/kart`-tilstand uten aktivt oppdrag. "Tilbake til oppdrag"-knappen forsvinner. Klikk på ruteplanleggeren igjen starter en ny, tom rute.

Eksisterende oppførsel for `routePlanningState` (nytt oppdrag opprettet fra dialog) endres ikke — den navigerer fortsatt tilbake til oppdragsdialogen.
