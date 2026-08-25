# Flytid: hvordan den kommer inn, og hvor det kan bli feil

## Slik kommer flytid inn i dag (verifisert i koden)

| Vei | Skriver `flight_log_personnel`? |
|---|---|
| Manuell logging (`LogFlightTimeDialog`) | Ja — pilot **pluss alle personer koblet til drona** (`drone_personnel`) |
| Manuell oppføring i loggboka (`FlightLogbookDialog`) | Ja — personen loggboka gjelder |
| DJI/ArduPilot enkeltimport (`UploadDroneLogDialog`) | Ja, men **kun hvis pilot er valgt** |
| Batch-import (`BatchLogPanel`) | Ja, men **kun hvis pilot er valgt** på raden |
| Redigering (`EditFlightLogDialog`) | Kan settes til "(Ingen pilot)" → alle koblinger fjernes |
| Offline-kø | Flylogg og personellrader køes som separate operasjoner |

Så nei — det er ikke garantert at alt skriver til `_personnel`.

## Feilkilder funnet (verifisert mot databasen)

1. **Medhjelpere teller som pilot.** Manuell logging kobler automatisk alle som er linket til drona på dronekortet. Tabellen har ingen rollekolonne (kun `flight_log_id` + `profile_id`), så alle får full flytid. 72 flylogger har i dag mer enn én person koblet.
2. **Logger uten pilotkobling (22 stk).** Med dagens regel tilfaller flytiden eieren (importøren), selv om en annen faktisk fløy.
3. **2 logger har verken eier eller pilotkobling** — de teller ikke for noen.
4. **`profiles.flyvetimer` følger en annen regel.** Trigger `trg_flp_recompute_pilot` → `recompute_profile_flyvetimer` summerer *kun* personellkoblinger, mens app-regelen også tar med egne logger uten kobling. Feltet vil derfor alltid avvike fra loggbok/KPI.
5. **Dobbelt bokføring i klienten.** Flere dialoger kaller `adjustHours('profiles', ...)` samtidig som DB-triggeren recomputer absolutt sum — inkonsekvent, og kan gi kortvarig feil tall.
6. **Delvis offline-synk** kan gi flylogg uten personellrad (samme effekt som punkt 2).

## Foreslått fiks

1. **Rolle på flyloggpersonell**: legg til `role text` (`pilot` / `crew`, default `pilot`) i `flight_log_personnel` med GRANTs uendret. Manuell logging skriver valgt pilot som `pilot` og drone-koblet personell som `crew`.
2. **All flytidsberegning teller kun `role = 'pilot'`** — `src/lib/pilotFlightLogs.ts` (begge funksjonene), `useStatusData`, `check-currency-status`, `ai-risk-assessment`, loggbøker og KPI.
3. **Samkjør `recompute_profile_flyvetimer`** med app-regelen: pilotkoblinger + egne logger uten pilotkobling. Da matcher `profiles.flyvetimer` det brukeren ser.
4. **Fjern klientens `adjustHours`-kall mot `profiles`** der DB-triggeren allerede recomputer, så det finnes én sannhetskilde.
5. **Gjør pilot obligatorisk** ved DJI/ArduPilot-import og i redigeringsdialogen (fjern "(Ingen pilot)"), og køa personellrad sammen med flyloggen offline.
6. **Rydding**: backfill `role='pilot'` på eksisterende rader, og rapporter (ikke slett) de 2 eierløse loggene i admin.

## Teknisk

- Én migrasjon: `ALTER TABLE ... ADD COLUMN role`, backfill, oppdatert `recompute_profile_flyvetimer`.
- Frontend: `pilotFlightLogs.ts`, `LogFlightTimeDialog`, `UploadDroneLogDialog`, `BatchLogPanel`, `EditFlightLogDialog`, `FlightLogbookDialog`, `useStatusData`.
- Edge functions: `check-currency-status`, `ai-risk-assessment`.
- Test: Martin (Elverum) skal vise likt tall i loggbok, KPI, currency og PDF-eksport.
