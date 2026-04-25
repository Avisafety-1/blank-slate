## Plan

### Mål
DJI-import skal fortsatt foreslå eksisterende oppdrag basert på tidspunkt, men den skal bare foreslå/auto-velge eksisterende flylogger som tilhører valgt pilot. Når pilot endres i loggseksjonen, skal eksisterende flylogg-match beregnes på nytt for den piloten.

### 1. Utvid match-data med pilotinformasjon
I `src/components/UploadDroneLogDialog.tsx` utvides `MatchedFlightLog` med pilot-ID-er/navn fra `flight_log_personnel`.

Når eksisterende flylogger hentes for et matchet oppdrag, hentes også tilknyttet personell:

```text
flight_logs
  -> flight_log_personnel
     -> profiles
```

Dette gjør at UI kan vite hvilke flylogger som faktisk tilhører valgt pilot.

### 2. Skill mellom oppdragsmatch og flyloggmatch
Behold dagens logikk for oppdrag:
- finn oppdrag samme kalenderdag
- sorter etter nærmest flytidspunkt
- forhåndsvelg nærmeste oppdrag

Endre kun flyloggmatch:
- `matchCandidates` filtreres mot `pilotId`
- eksisterende flylogger fra andre piloter vises ikke som oppdaterbare kandidater
- hvis valgt pilot ikke har en eksisterende logg på oppdraget, skal UI foreslå «Legg til som ny flytur»

### 3. Re-match når pilot endres
Pilotvelgeren i loggseksjonen får en egen handler, f.eks. `handlePilotChange(newPilotId)`, som:
- oppdaterer valgt pilot
- fjerner `matchedLog` hvis den tilhører en annen pilot
- auto-velger en kandidat dersom valgt oppdrag har en eksisterende flylogg for den nye piloten
- ellers lar `matchedLog` være tom slik at import oppretter ny flylogg på oppdraget

Dette dekker tilfellet: «når man endrer pilot fra listen i loggen, kan den auto-matche på logger hvis loggen tilhører valgt pilot».

### 4. Sikre duplikatlogikk mot feil pilot
SHA-256-duplikatkontrollen i `findMatchingFlightLog()` endres slik at den ikke automatisk setter `matchedLog` for en logg som tilhører en annen pilot.

Forslag:
- hvis SHA-256-duplikat finnes for valgt pilot: forhåndsvelg den som eksisterende flylogg
- hvis SHA-256-duplikat finnes for annen pilot: ikke forhåndsvelg som oppdaterbar logg; vis eventuelt en nøytral info om at loggen allerede finnes på en annen pilot, og la bruker legge inn som ny/velge riktig pilot

Dette hindrer at importdata overskriver andre piloters flylogger ved et uhell.

### 5. Oppdater visningen for eksisterende flyturer
I listen «Eksisterende flyturer på dette oppdraget» vises kun logger for valgt pilot. Teksten kan tydeliggjøres:

```text
Eksisterende flyturer for valgt pilot på dette oppdraget
```

Hvis oppdraget har logger, men ingen for valgt pilot, vises en kort hjelpetekst:

```text
Ingen eksisterende flytur for valgt pilot. Loggen legges til som ny flytur på oppdraget.
```

### 6. Behold eksisterende lagringsflyt
Lagring trenger i hovedsak ikke ny database-struktur:
- oppdater eksisterende logg kun når `matchedLog` er en pilot-godkjent kandidat
- ny logg kobles fortsatt til valgt pilot via `flight_log_personnel`
- eksisterende flytidjustering i `saveLogbookEntries()` beholdes

## Teknisk

Berørt fil:
- `src/components/UploadDroneLogDialog.tsx`

Ingen databaseendringer er planlagt. Endringen ligger i frontend-matchlogikken og bruker eksisterende `flight_log_personnel`-kobling.