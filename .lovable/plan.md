# Riktig flytid fra nå av (ingen databaseendring)

Ingen migrasjon, ingen backfill, ingen endring på eksisterende logger. Vi strammer bare inn hvordan nye flyturer skrives.

## Svar på spørsmålene dine

**Hvor lagres personene på oppdraget:** i `mission_personnel` (med rolle) — ikke i `flight_log_personnel`. De påvirker ikke flytid.

**Er feilen bare at `LogFlightTimeDialog` skriver flere personer?** Ja, det er hovedfeilen, men kilden er dronekortet, ikke oppdraget: `fetchDroneLinks` henter alle profiler i `drone_personnel` for valgt drone, og alle disse skrives til `flight_log_personnel` i tillegg til valgt pilot. Alle får da full flytid i loggbok og KPI. 72 eksisterende logger har mer enn én person koblet.

**"Dobbelt bokføring i klienten":** `profiles.flyvetimer` skrives av to steder samtidig. Klienten (`EditFlightLogDialog`, `BatchLogPanel`, `UploadDroneLogDialog`) gjør `flyvetimer = flyvetimer ± minutter/60`, mens databasetriggeren `trg_flp_recompute_pilot` samtidig regner ut hele summen på nytt fra `flight_log_personnel`. To skrivere mot samme felt = kappløp og tall som spretter.

**Hva brukes `profiles.flyvetimer` til:** nesten ingenting lenger. Loggboka henter feltet, men viser det ikke (bruker summen av flyturene). Eneste reelle bruk er i `ai-risk-assessment` som fallback når piloten ikke har loggførte turer. Alt annet `flyvetimer` i koden gjelder droner og utstyr, ikke personer.

## Endringer

1. **Kun valgt pilot krediteres.** `LogFlightTimeDialog` slutter å skrive drone-koblet personell til `flight_log_personnel`; kun piloten fra nedtrekket skrives. Drone-koblingen brukes fortsatt til å foreslå pilot automatisk. Gjelder både online-lagring og offline-køen.
2. **Offline-køen skriver pilotraden sammen med flyloggen** (samme rekkefølge/avhengighet), så en delvis synk ikke etterlater en flylogg uten pilot.
3. **Pilot blir obligatorisk** ved lagring i `LogFlightTimeDialog`, DJI/ArduPilot-import (`UploadDroneLogDialog`, `BatchLogPanel`) og i `EditFlightLogDialog` (fjerner "(Ingen pilot)"). Da får ingen nye logger manglende kobling.
4. **Én skriver på `profiles.flyvetimer`.** Fjern klientens `adjustHours('profiles', …)`-kall; databasetriggeren står for pilottimene. `adjustHours` for drone og utstyr beholdes uendret.
5. **Ingen opprydding** av gamle logger uten kobling — dagens fallback (eier = pilot når ingen kobling finnes) blir stående og dekker dem.

## Teknisk

- Filer: `src/components/LogFlightTimeDialog.tsx`, `src/components/UploadDroneLogDialog.tsx`, `src/components/upload/BatchLogPanel.tsx`, `src/components/EditFlightLogDialog.tsx`.
- Ingen SQL, ingen nye tabeller/kolonner. `src/lib/pilotFlightLogs.ts` beholdes som felles leseregel.
- Nye i18n-nøkler for "Pilot er påkrevd"-validering i både `no.json` og `en.json`.

## Verifisering

- Ny manuell flytur på en drone med flere koblede personer: kun valgt pilot får flytid; de andre er uendret i loggbok og KPI.
- Ny DJI-import uten valgt pilot kan ikke lagres.
- Endring av varighet på eksisterende logg: `profiles.flyvetimer` oppdateres én gang, av triggeren.
