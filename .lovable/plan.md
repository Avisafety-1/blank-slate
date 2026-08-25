# Riktig flytid fra nå av (ingen databaseendring)

Ingen migrasjon, ingen backfill, ingen endring på eksisterende logger. Vi strammer bare inn hvordan nye flyturer skrives.

## Svar på spørsmålene dine

**Hvor lagres personene på oppdraget:** i `mission_personnel` (med rolle) — ikke i `flight_log_personnel`. De påvirker ikke flytid.

**Er feilen bare at `LogFlightTimeDialog` skriver flere personer?** Ja, det er hovedfeilen, men kilden er dronekortet, ikke oppdraget: `fetchDroneLinks` henter alle profiler i `drone_personnel` for valgt drone, og alle disse skrives til `flight_log_personnel` i tillegg til valgt pilot. Alle får da full flytid i loggbok og KPI. 72 eksisterende logger har mer enn én person koblet.

**"Dobbelt bokføring i klienten":** `profiles.flyvetimer` skrives av to steder samtidig. Klienten (`EditFlightLogDialog`, `BatchLogPanel`, `UploadDroneLogDialog`) gjør `flyvetimer = flyvetimer ± minutter/60`, mens databasetriggeren `trg_flp_recompute_pilot` samtidig regner ut hele summen på nytt fra `flight_log_personnel`. To skrivere mot samme felt = kappløp og tall som spretter.

**Hva brukes `profiles.flyvetimer` til:** nesten ingenting — og du har rett, vi bør slutte å bruke det. Loggboka henter feltet uten å vise det; eneste reelle bruk er `ai-risk-assessment` som fallback. Ingen UI redigerer feltet direkte i dag; det endres bare indirekte av `adjustHours`-kall og DB-triggeren. Flytimer for personer skal være en ren avledning av flyloggene.

**Hvor havner timene ved batch-logging av DJI/ArduPilot?** Batch-import lager én rad i `flight_logs` (med `duration_minutes`) per fil, og én rad i `flight_log_personnel` for valgt pilot. Det er den koblingen som gir flytid — nøyaktig samme mekanisme som manuell logging. Ingenting går tapt når vi slutter å bruke `profiles.flyvetimer`, fordi loggbok, KPI, currency, PDF og AI-risiko allerede summerer fra `flight_logs` via `src/lib/pilotFlightLogs.ts`.

**Hva kan gå galt når vi dropper `profiles.flyvetimer`?** Tre ting, og alle dekkes av planen:
1. Batch-rad uten valgt pilot ville gitt 0 timer på alle → derfor gjøres pilot obligatorisk ved import (punkt 3).
2. Startsaldo for piloter med timer fløyet før Avisafe finnes bare i `profiles.flyvetimer`. Etter endringen vises kun timer som faktisk ligger i systemet. Si fra hvis du heller vil beholde feltet som et rent "startsaldo"-tillegg — det er en liten ekstra endring, ikke en databaseendring.
3. `ai-risk-assessment` mister fallbacken og rapporterer 0 timer for piloter helt uten logger (i dag kunne den vise et trigget triggertall). Det er mer korrekt, men gir lavere erfaringstall for nye piloter.

## Endringer

1. **Kun valgt pilot krediteres.** `LogFlightTimeDialog` slutter å skrive drone-koblet personell til `flight_log_personnel`; kun piloten fra nedtrekket skrives. Drone-koblingen brukes fortsatt til å foreslå pilot automatisk. Gjelder både online-lagring og offline-køen.
2. **Offline-køen skriver pilotraden sammen med flyloggen** (samme rekkefølge/avhengighet), så en delvis synk ikke etterlater en flylogg uten pilot.
3. **Pilot blir obligatorisk** ved lagring i `LogFlightTimeDialog`, DJI/ArduPilot-import (`UploadDroneLogDialog`, `BatchLogPanel`) og i `EditFlightLogDialog` (fjerner "(Ingen pilot)"). Da får ingen nye logger manglende kobling.
4. **`profiles.flyvetimer` pensjoneres som kilde for pilottimer.** Ja — `BatchLogPanel` skriver til feltet (`adjustHours("profiles", row.pilotId, …)` etter import). Fullstendig liste over det som skriver pilottimer i dag:
   - `src/components/upload/BatchLogPanel.tsx` (linje 437)
   - `src/components/UploadDroneLogDialog.tsx` (linje 1840, 1845, 1849, 1853)
   - `src/components/EditFlightLogDialog.tsx` (linje 156, 162, 166)
   - DB-triggeren `trg_flp_recompute_pilot` (recompute ved hver personellkobling)

   `src/lib/flightLogDeletion.ts` rører kun droner/utstyr — ingen pilotjustering ved sletting i dag.

   Alle `adjustHours('profiles', …)`-kallene over fjernes (drone og utstyr beholdes uendret), hentingen i `FlightLogbookDialog` fjernes, og `ai-risk-assessment` slutter å bruke feltet som fallback (bruker kun summen fra flyloggene). Kolonnen og triggeren røres ikke nå — de blir bare ubrukte, og kan ryddes bort senere.
5. **Timer endres kun via flyloggen.** Endret varighet, byttet pilot eller slettet flylogg gir automatisk riktig sum, fordi alle visninger regner ut summen fra `flight_logs` + `flight_log_personnel` ved lesing (`src/lib/pilotFlightLogs.ts`). Ingen manuell justering av timer noe sted.
6. **Ingen opprydding** av gamle logger uten kobling — dagens fallback (eier = pilot når ingen kobling finnes) blir stående og dekker dem.

## Teknisk

- Filer: `src/components/LogFlightTimeDialog.tsx`, `src/components/UploadDroneLogDialog.tsx`, `src/components/upload/BatchLogPanel.tsx`, `src/components/EditFlightLogDialog.tsx`, `src/components/FlightLogbookDialog.tsx`, `supabase/functions/ai-risk-assessment/index.ts`.
- Ingen SQL, ingen nye tabeller/kolonner. `src/lib/pilotFlightLogs.ts` er eneste leseregel for pilottimer.
- Nye i18n-nøkler for "Pilot er påkrevd"-validering i både `no.json` og `en.json`.

## Verifisering

- Ny manuell flytur på en drone med flere koblede personer: kun valgt pilot får flytid; de andre er uendret i loggbok og KPI.
- Ny DJI-import uten valgt pilot kan ikke lagres.
- Endre varighet på en logg og slett en logg: loggbok, KPI, currency og AI-risikovurdering viser umiddelbart samme, oppdaterte tall — uten at noe felt må oppdateres.
