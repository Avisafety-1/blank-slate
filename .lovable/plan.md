

## Utvid DJI-import: Vis eksisterende flyturer på valgt oppdrag

Når brukeren velger et oppdrag som allerede har flylogger, viser systemet i dag automatisk den nærmeste loggen og tilbyr kun «Oppdater». Brukeren får ikke valget mellom å oppdatere en spesifikk flytur eller legge til DJI-dataen som en ny flytur.

### Endringer

**`src/components/UploadDroneLogDialog.tsx`**

1. **Matching-logikk (linje 871-889)**: I stedet for å automatisk sette `matchedLog` til den nærmeste loggen, lagre alle eksisterende logger i `matchCandidates` (som allerede finnes som state). Ikke sett `matchedLog` automatisk — la brukeren velge.

2. **Ny UI-seksjon**: Når `matchCandidates.length > 0` og brukeren har valgt et oppdrag (`selectedMissionId`), vis en liste over eksisterende flyturer på det oppdraget med en RadioGroup:
   - Hver flytur viser dato, varighet, drone og pilot
   - Alternativ for «Legg til som ny flytur» nederst
   - Valg av en eksisterende flytur setter `matchedLog` og viser «Oppdater flylogg»-knappen
   - Valg av «ny flytur» nullstiller `matchedLog` og viser «Lagre flylogg»-knappen

3. **Oppdater ved misjon-bytte**: Når brukeren bytter `selectedMissionId` i oppdrags-listen, filtrer `matchCandidates` for den valgte misjonen og oppdater visningen.

4. **Footer-logikk (linje 2225-2244)**: Tilpass slik at når bruker har valgt et oppdrag med eksisterende logger men velger «ny flytur», brukes `handleLinkToMission` (oppretter ny logg på eksisterende oppdrag).

### Flyt

```text
Bruker importerer DJI-fil
  → Systemet finner matchende oppdrag (som nå)
  → Systemet henter ALLE flylogger på matchende oppdrag
  → Hvis flylogger finnes på valgt oppdrag:
      Vis liste:
        ○ Flytur 15.03 – 23 min – DJI Mini 4 Pro  [Oppdater denne]
        ○ Flytur 15.03 – 12 min – DJI Mini 4 Pro  [Oppdater denne]
        ○ Legg til som ny flytur                   [Opprett ny]
  → Bruker velger, trykker lagre/oppdater
```

