# Dronematch som ekstra regel ved automatch av flylogg til oppdrag

## Slik fungerer det i dag

Automatch mot oppdrag skjer **kun på tid**, både i enkeltopplasting og batch:

1. Loggens starttidspunkt tolkes (`parseFlightDate`, fallback `flight_date` i batch).
2. Alle oppdrag i selskapet samme kalenderdag (lokal tid 00:00–23:59) hentes.
3. Oppdragene sorteres på nærmeste `tidspunkt` til loggens start.
4. Det nærmeste oppdraget forhåndsvelges. Dronen på loggen brukes ikke i det hele tatt.

Det betyr at når flere oppdrag ligger samme dag, avgjør bare klokkeslettet – selv om ett av oppdragene har nøyaktig den dronen loggen kommer fra.

## Ny regel

Når flere oppdrag matcher på dato, skal dronen brukes som avgjørende kriterium:

1. Finn oppdrag samme dag (som i dag).
2. Slå opp hvilke droner som er knyttet til disse oppdragene (`mission_drones`).
3. Filtrer på oppdrag der loggens matchede drone er tilknyttet:
   - Nøyaktig ett treff → dette oppdraget forhåndsvelges.
   - Flere treff → velg det nærmeste i tid blant disse.
   - Ingen treff (eller ingen drone identifisert på loggen) → dagens oppførsel: nærmeste i tid blant alle.
4. Brukerens eget valg overstyrer alltid automatikken, som før.

I lista over oppdrag vises et lite merke på oppdrag som har loggens drone tilknyttet, slik at det er tydelig hvorfor valget ble gjort.

Samme regel brukes både i enkeltbehandling og i batch-panelet, slik at de gir likt resultat.

## Teknisk

- `src/components/UploadDroneLogDialog.tsx` (mission-søket rundt linje 1711–1745): etter at oppdrag samme dag er hentet, hent `mission_drones` (`mission_id, drone_id`) for de aktuelle `mission_ids`. Bruk den allerede matchede drone-id-en (SN-matchen som skjer før oppdragssøket) til å filtrere. Sorter fortsatt på tidsavstand, men prioriter dronetreff først.
- `src/components/upload/BatchLogPanel.tsx` (mission-effekten rundt linje 205–245): samme oppslag per rad, med `row.droneId` (fra `resolveDroneId`) som filter. `autoMatchedMissionId` settes til det prioriterte oppdraget.
- Felles hjelpefunksjon `pickBestMission(missions, missionDroneIds, droneId, flightStart)` legges i `src/lib/droneLogMatching.ts` slik at begge kodeveier bruker identisk logikk.
- Dronematchen må kjøres før oppdragsmatchen i batch (den gjør den allerede); i rader der dronen først blir kjent etter at oppdragene er hentet, kjøres forhåndsvalget på nytt så lenge brukeren ikke har overstyrt.
- Nye i18n-nøkler for merket «matchet på drone» i både `no.json` og `en.json`.
- Ingen databaseendringer, ingen endring i RLS eller edge-funksjoner.
