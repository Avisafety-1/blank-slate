# Automatch av drone: lagret treff henger igjen

## Hva som faktisk skjer

Forhåndsvalget kommer ikke fra et nytt serienummer-søk. Da loggene ble lastet opp (mens dronen fortsatt hadde serienummeret), lagret systemet treffet permanent på loggen. Alle «MAVIC 2»-loggene i moderavdelingen har fortsatt dette lagrede treffet mot MAVIC 2 (id `22c2…`), selv om serienummeret nå er tomt. Dialogen bruker det lagrede treffet direkte og hopper over serienummer-sjekken — derfor blir dronen fortsatt forhåndsvalgt, og «ukjent drone»-dialogen dukker aldri opp.

Til det forrige spørsmålet ditt: nei, ingen data kunne bli logget på et annet selskap. Lesing av droner er begrenset i databasen til din avdeling med underavdelinger, og flylogger lagres alltid på din egen avdeling. Jeg var upresis i forrige svar.

## Det som skal fikses

1. **Valider lagret treff mot dagens data.** Når en logg åpnes, brukes det lagrede treffet bare hvis dronen fortsatt finnes, er aktiv, er synlig for deg og faktisk matcher loggens serienummer (eller dronenavn). Hvis ikke, forkastes det og vanlig automatch kjøres på nytt.
2. **Ingen treff = ukjent drone.** Faller den gjennom, markeres loggen som ukjent drone med tilbud om å opprette ny — slik du forventet.
3. **Automatch søker kun i synlige avdelinger.** Allerede gjort: dronelisten i dialogen hentes nå kun for din avdeling og underavdelinger.
4. **Samme regel i bulk/batch-visningen** slik at enkeltopplasting og masseopplasting oppfører seg likt.
5. **Vis avdeling i dronevelgeren** («MAVIC 2 – Navn (Avdeling Oslo)»), så det er tydelig hvilken drone som er valgt når flere har likt navn.

Ingen databaseendring er nødvendig — de gamle, lagrede treffene blir bare ignorert når de ikke stemmer lenger.

## Teknisk

- `UploadDroneLogDialog.tsx`: der `pendingLog.matched_drone_id` brukes (ca. linje 1638), erstatt direkte bruk med en validering mot `drones`-listen via `snMatchesDjiSn`/`djiNameMatches`; ved manglende treff kall `matchDroneFromResult(data)` som i dag og la `unmatchedDroneSN` settes.
- Samme validering i `src/components/upload/BatchLogPanel.tsx` og `src/components/PendingDjiLogsSection.tsx` der `matched_drone_id` leses.
- `droneOptionLabel` i `src/lib/droneLogMatching.ts` utvides med avdelingsnavn; dronespørringen i dialogen henter `company_id, companies(navn)`.
- Nye tekster legges i `no.json` og `en.json`.
