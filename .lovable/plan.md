Plan for å vise tildelt pilot/personell på dronekortene i /ressurser:

1. Hent tildelt personell sammen med dronene
   - Utvid drone-spørringen i `src/pages/Resources.tsx` til å inkludere `drone_personnel` med tilhørende `profiles` (`id`, `full_name`, eventuelt `tittel`).
   - Dette bruker eksisterende koblingstabell som allerede brukes i dronedetaljene for “Tilknyttet personell”.

2. Vis personell over registreringsnummer
   - På hvert dronekort i `/ressurser`, legg inn en ny linje rett under dronemodellen og før `Reg.nr`.
   - Tekstforslag:
     - Én person: `Pilot: Ola Nordmann`
     - Flere personer: `Pilot: Ola Nordmann +1`
   - Hvis ingen personell er tilknyttet, vises ingenting, slik at kort uten pilot beholder dagens layout.

3. Hold visningen kompakt på mobil
   - Bruk samme små, dempede tekststil som `Reg.nr`, og truncate/liste kompakt slik at kortene ikke blir for høye på 360px bredde.
   - Behold status-badge til høyre slik som i skjermbildet.

4. Oppdater søk og cache
   - Inkluder tildelt personellnavn i dronesøket, slik at man kan søke etter pilotnavn.
   - Siden dronelisten caches offline, vil de nye personellfeltene også lagres i eksisterende offline-cache for droner.

5. Sørg for oppdatering etter endringer
   - Når personell legges til/fjernes i `DroneDetailDialog`, kalles allerede `onDroneUpdated`, så dronelisten skal refetches og vise oppdatert pilotlinje etter lukking/endring.

Teknisk detalj:
- Endringen gjøres kun i frontend i `src/pages/Resources.tsx`.
- Ingen databaseendring trengs, fordi `drone_personnel` og relasjonen til `profiles` allerede finnes og brukes i `DroneDetailDialog`.