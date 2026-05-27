## Diagnose

Når en flylogg lastes opp matches den mot oppdrag på to måter i `src/components/UploadDroneLogDialog.tsx`:

1. **SHA-256-duplikat** (samme fil tidligere lastet opp) — linje ~1373–1417. Her er det meningsfullt å foreslå "oppdater eksisterende".
2. **Dag-match på oppdrag** (ny fil, samme oppdrag) — linje ~1466–1480. Her settes `matchedLog` automatisk til første eksisterende logg for piloten:
   ```ts
   if (pilotLogs.length === 1) {
     setMatchedLog(pilotLogs[0]);
     setSelectedFlightLogChoice(pilotLogs[0].id);
   }
   ```
3. **Pilot-bytte-effekt** linje 360–374: hvis pilot endres og det finnes nøyaktig én match, auto-velger den også eksisterende logg.

Det er punkt 2 og 3 som gir feilen brukeren beskriver: logg #2 for samme DJI-flytur/oppdrag treffer ikke SHA-dup, men dag-matchen pre-velger logg #1 → varigheten "appendes". Brukeren må manuelt klikke "ny flyvning".

## Fiks

I `src/components/UploadDroneLogDialog.tsx` skal standard for dag-match-stien være **ny flyvning**, mens eksisterende logger fortsatt vises som valg i radio-gruppen.

1. **Dag-match (linje 1466–1480):** ikke kall `setMatchedLog(...)`/`setSelectedFlightLogChoice(...)` for å auto-velge en eksisterende logg. Behold `setMatchCandidates(enrichedLogs)` slik at radioknappene listes. Sett eksplisitt `setSelectedFlightLogChoice('__new_flight__')` og `setMatchedLog(null)`. Tilpass toast-meldingene:
   - 0 pilot-logger: "Oppdraget matcher tidspunktet. Loggen registreres som ny flyvning."
   - ≥1 pilot-logger: "Oppdraget har eksisterende flyvninger for valgt pilot. Loggen registreres som ny flyvning – velg en eksisterende hvis du vil oppdatere den i stedet."

2. **Pilot-bytte-effekt (linje 360–374):** fjern grenen som auto-velger `pilotMatches[0]` når det finnes nøyaktig én match (`else if (!matchedLog && pilotMatches.length === 1)`). Behold logikken som nullstiller `matchedLog` hvis valgt logg ikke tilhører ny pilot. Standard forblir "ny flyvning".

3. **SHA-256-duplikat (linje ~1373–1417):** beholdes som i dag. Det er samme fil – "oppdater" er fortsatt riktig standard. (Brukeren kan fortsatt manuelt bytte til "ny flyvning" der.)

4. **Radio-default (linje ~2994):** `value={selectedFlightLogChoice || (matchedLog ? matchedLog.id : '__new_flight__')}` faller allerede tilbake til `__new_flight__` når `matchedLog` er null, så ingen UI-endring trengs utover at staten nå starter der.

## Verifisering

- Last opp logg #1 for et oppdrag → ny flyvning opprettes (uendret).
- Last opp logg #2 (annen fil, samme oppdrag, samme pilot) → standard er nå **ny flyvning**; eksisterende logg #1 vises som valgbar radioknapp. Hvis bruker bytter til logg #1 manuelt → oppdaterer logg #1 som før.
- Last opp samme fil to ganger (SHA-dup) → fortsatt forslag om å oppdatere eksisterende (uendret).
- Bytt pilot i nedtrekk etter analyse → ingen auto-binding til eksisterende logg.

## Tekniske detaljer

- Bare `src/components/UploadDroneLogDialog.tsx` endres.
- Ingen DB- eller skjemaendringer.
- Ingen endring i lagrings­logikken (`onSubmit`/`saveFlightEvents`); den respekterer allerede `matchedLog === null` som "opprett ny".
