# Flytid per pilot: samme regel overalt

Vi har nå én regel i `src/lib/pilotFlightLogs.ts`:
en flytur teller for en person hvis personen er koblet via `flight_log_personnel`,
eller hvis personen eier loggen (`flight_logs.user_id`) og loggen ikke har noen personellkobling.

Gjennomgangen viser at flere steder fortsatt bruker andre regler og derfor viser andre tall.

## Funn (verifisert i kode/database)

| Sted | Regel i dag | Konsekvens |
|---|---|---|
| Loggbok-dialog + personell-KPI | Ny felles regel | Riktig |
| PDF-eksport av loggboka (`FlightLogbookDialog`) | Bruker samme liste som dialogen | Blir riktig automatisk |
| `profiles.flyvetimer` (lagret verdi i databasen) | Summeres kun fra `flight_log_personnel` | For lav. Endres ikke — vi slutter heller å bruke den som fasit i visninger |
| AI-risikovurdering (`ai-risk-assessment`) | Kun `flight_log_personnel`, med fallback til `profiles.flyvetimer` | For lav erfaring/for få turer siste 30/90 dager |
| Currency-varsler (`check-currency-status`) | Kun `flight_logs.user_id` | Både for høyt (turer man ikke fløy selv) og for lavt (turer der man er koblet, men ikke eier) |
| Personell-status/currency i UI (`useStatusData`) | Kun `flight_logs.user_id` | Samme feil: feil grønn/gul/rød på personellkort |
| Oppdrags-PDF, /status-aggregater, avvik | Teller flyturer på selskaps-/oppdragsnivå, ikke per pilot | Uendret, ingen feil |

## Foreslått fiks (kun app-kode, ingen databaseendringer)

Ingen migrasjon, ingen trigger-endring, ingen backfill. `profiles.flyvetimer` blir stående som den er; vi beregner riktig tall ved lesing i stedet.

1. **Felles regel i frontend**: utvid `src/lib/pilotFlightLogs.ts` slik at den også kan returnere selve flyturene (minutter og dato) for én eller flere personer, ikke bare ID-ene.
2. **Personell-status/currency i UI** (`useStatusData`): bytt fra `flight_logs.user_id` til den felles regelen, slik at statusfargene stemmer med loggboka.
3. **Currency-varsler** (`check-currency-status`): samme regel i edge-funksjonen — hent koblede flyturer + egne flyturer uten personellkobling, i stedet for kun eide.
4. **AI-risikovurdering** (`ai-risk-assessment`): ta med egne, ukoblede flyturer i pilotstatistikken, og bruk denne summen som totaltimer i stedet for `profiles.flyvetimer`.

## Teknisk

- Filer: `src/lib/pilotFlightLogs.ts`, `src/hooks/useStatusData.ts`, `supabase/functions/check-currency-status/index.ts`, `supabase/functions/ai-risk-assessment/index.ts`.
- Regelen dokumenteres ett sted i `pilotFlightLogs.ts`; edge-funksjonene får en kommentar som peker dit.
- Ytelse: hent personellkoblinger i én `in(...)`-spørring per visning, ikke per person.

## Verifisering

- Martin (Elverum vgs): loggbok, KPI og currency-status viser samme tall (4t38m).
- ELVIS (eier mange logger med andre piloter): får ikke kreditert andres flyturer.
- AI-risikovurdering på et oppdrag med disse pilotene viser samme timetall som loggboka.

