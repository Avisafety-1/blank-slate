

## Fix: «Kunne ikke lagre flyloggen» ved «Legg til som ny flytur»

### Problem
Når SHA-256-duplikat allerede finnes i `flight_logs` og brukeren velger «Legg til som ny flytur», forsøker `handleLinkToMission` å gjøre en ny `INSERT` med samme `dronelog_sha256`. Den unike constrainten `idx_flight_logs_sha256_company` avviser dette.

### Løsning
I `handleLinkToMission`: Når det allerede finnes en duplikat-logg (SHA-256 match finnes i databasen), skal systemet **oppdatere** den eksisterende loggen med ny `mission_id` i stedet for å opprette en ny rad. Alternativt, hvis brukeren eksplisitt velger «ny flytur» på et oppdrag der duplikaten allerede er koblet, sett `dronelog_sha256` til `null` i den nye raden for å unngå constraint-feil (siden det teknisk sett er en ny flytur-registrering basert på samme data).

**Valgt tilnærming**: Sjekk om `matchedLog` er `null` men det finnes en SHA-256-duplikat i `matchCandidates` eller databasen. Hvis ja:
- Oppdater den eksisterende loggens `mission_id` til `selectedMissionId` og oppdater tilhørende felter
- Hvis brukeren eksplisitt vil ha en helt ny flytur-rad (ikke oppdatering), utelat `dronelog_sha256` fra insert for å unngå constraint-brudd

### Endring

**`src/components/UploadDroneLogDialog.tsx` — `handleLinkToMission` (linje 1239-1296)**:
1. Før insert, sjekk om det allerede finnes en `flight_logs`-rad med samme SHA-256 hash for dette selskapet
2. Hvis ja: oppdater den eksisterende radens `mission_id` og andre felter i stedet for å inserte
3. Hvis nei: gjør insert som normalt
4. Sørg for at ressurser (drone, pilot, utstyr) fortsatt kobles til oppdraget uansett

