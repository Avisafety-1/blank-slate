# Pilotfilteret på Loggfiler viser bare «eiere» av loggen

## Årsak (verifisert)

Pilot-nedtrekket bygges fra `flight_logs.user_id` (den som eier/importerte loggen), ikke fra den faktiske piloten i `flight_log_personnel`.

I Elverum videregående skole:

| Person | Piloter på (personell) | Eier logger |
|---|---|---|
| Dronepilot ELVIS | 8 | 95 |
| Martin Sunnevåg Madsbu | 36 | 39 |
| Sverre Rasmussen | 59 | 26 |
| Natan Asfaw | 13 | 0 |
| Kristian Moe | 10 | 0 |
| Jonas, Rane, Micael m.fl. | 5–7 hver | 0 |

Derfor vises kun de tre som har logger på `user_id` i lista — Natan og de andre faller ut selv om de er registrert som pilot.

Samme feil gjelder også selve filtreringen (`user_id.eq`) og pilotnavnet på loggkortene, som viser eier og ikke pilot.

## Endring

Bruk samme sannhetskilde som loggboken og KPI-ene (`src/lib/pilotFlightLogs.ts`): pilot = personellkoblingen, med eier som fallback bare når loggen ikke har noen personellrad.

1. **Pilotvalg i filteret**: hent personell-koblingene for loggene som er synlige med de øvrige filtrene, slå sammen med eier-ID-er for logger uten personellrad, og bygg nedtrekket av disse profilene.
2. **Filtrering på pilot**: når en pilot velges, hent personens logg-ID-er (personellkobling + egne logger uten pilot) og filtrer med `id.in.(...)` i stedet for `user_id.eq`.
3. **«Kun mine»**: samme regel — egne logger tas kun med når de ikke har en annen pilot koblet (i dag tas alle `user_id`-logger med).
4. **Pilotnavn på loggkortet**: vis den koblede piloten når den finnes, ellers eieren.
5. **Søk på navn**: treff på personnavn skal også slå på personellkoblingen, ikke bare `user_id`.

## Teknisk

- `src/hooks/useFlightLogsList.ts`: ny henting av `flight_log_personnel` for gjeldende filtersett (chunket `.in()` for å unngå tunge spørringer), justert `applyFilters` for pilot/onlyMine, og `enrich` som slår opp pilotnavn via personellkoblingen.
- Gjenbruk av eksisterende regel fra `src/lib/pilotFlightLogs.ts`; ingen databaseendringer, ingen nye i18n-nøkler.
