# Test av nye logg-identifikatorer hos Elverum vgs

## Hva jeg fant

Elverum Videregående Skole har tre lagrede DJI-innlogginger:

| Bruker | DJI-konto | Autosync | Sist synk |
| --- | --- | --- | --- |
| Dronepilot ELVIS (selv.dronefag@innlandetfylke.no) | selv.dronefag@innlandetfylke.no | På | 21. aug 09:54 |
| Sverre Rasmussen (sveras@innlandetfylke.no) | sverrerass@hotmail.com | På | 16. aug 21:00 |
| Martin S. Madsbu (matmad@innlandetfylke.no) | martinsm93@gmail.com | Av | 13. aug 07:09 |

Siste synkejobber (20.–21. aug, ELVIS-kontoen) er alle fullført uten feil, så pipelinen fungerer — vi kan trygt kjøre en ny behandling for å se om `rcSN`/`fcSN`/`cameraSN`/`gimbalSN` faktisk kommer med fra DroneLog-API-et.

## Slik tester vi

1. Velg 2–3 allerede behandlede logger fra ELVIS-kontoen (20. aug) og legg dem inn på nytt i synkekøen som nye jobber, merket som testkjøring, slik at eksisterende flylogger ikke røres.
2. La bakgrunnsjobben kjøre dem gjennom oppdatert `process-dronelog`.
3. Les ut de nye identifikatorene fra resultatet og sammenlign loggene mot hverandre — hovedspørsmålet er om `rcSN`/`fcSN`/`cameraSN`/`gimbalSN` er unike per drone der `aircraftSN` kolliderer på 16 tegn.
4. Rapporter en tabell: logg-ID, aircraftName, aircraftSN, fcSN, rcSN, cameraSN, gimbalSN.

Alternativt kan vi kjøre en full autosync for ELVIS-kontoen, men det henter flere logger enn nødvendig for en test.

## Teknisk

- Nye jobber legges i `dji_sync_jobs` med samme `download_url`/`dji_log_id` som de fullførte jobbene, `status = 'pending'`.
- Ingen kodeendringer i denne runden; feltene er allerede lagt til i `process-dronelog`, `dji-process-single`, `_shared/dji-parser.ts` og `dji-parse-proxy`.
- Duplikatvern kan gjøre at loggen hoppes over som «duplicate» — hvis det skjer, leser vi identifikatorene direkte fra en engangs-testkjøring mot API-et i stedet for å lagre en ny flylogg.
