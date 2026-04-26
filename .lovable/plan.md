Jeg fant årsaken i `UploadDroneLogDialog`: når du velger «Legg til som ny flytur», settes `matchedLog` til `null`, men en `useEffect` auto-velger eksisterende match igjen dersom det finnes nøyaktig én flytur for valgt pilot på valgt oppdrag. Derfor blinker radio-knappen og går tilbake til eksisterende logg.

Plan:
1. Legge til en eksplisitt bruker-valg-state for eksisterende flytur-valget, f.eks. `selectedFlightLogChoice`, med verdiene:
   - eksisterende `flight_log.id`
   - `__new_flight__`
   - tom/automatisk før bruker har valgt
2. Endre auto-match-logikken slik at den bare forhåndsvelger eksisterende logg før brukeren aktivt har valgt noe. Når brukeren velger `__new_flight__`, skal auto-match ikke kunne overstyre det.
3. Oppdatere RadioGroup for «Eksisterende flyturer» til å bruke denne eksplisitte verdien, ikke bare `matchedLog ? id : '__new_flight__'`.
4. Sørge for at valg nullstilles riktig når:
   - man bytter oppdrag
   - man bytter pilot
   - dialogen resettes
   - en ny logg behandles
5. Beholde dagens lagringsflyt:
   - eksisterende logg valgt → `Oppdater flylogg`
   - `Legg til som ny flytur` valgt → `Lagre flylogg` på valgt oppdrag
   - `Opprett nytt oppdrag` valgt → oppretter nytt oppdrag

Teknisk hovedendring:
```ts
// Når bruker velger ny flytur:
setSelectedFlightLogChoice('__new_flight__');
setMatchedLog(null);

// Auto-match kun hvis bruker ikke allerede har valgt:
if (!selectedFlightLogChoice && pilotLogs.length === 1) {
  setMatchedLog(pilotLogs[0]);
  setSelectedFlightLogChoice(pilotLogs[0].id);
}
```

Dette gjør at «Legg til som ny flytur» forblir valgt og ikke hopper tilbake til matchen på eksisterende flylogg.