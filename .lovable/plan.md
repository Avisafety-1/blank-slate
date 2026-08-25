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
| `profiles.flyvetimer` (DB-funksjon `recompute_profile_flyvetimer`) | Kun `flight_log_personnel` | For lavt: egne, ukoblede flyturer telles ikke |
| AI-risikovurdering (`ai-risk-assessment`) | Kun `flight_log_personnel` | For lav erfaring/for få turer siste 30/90 dager. Faller dessuten tilbake på `profiles.flyvetimer`, som også er for lav |
| Currency-varsler (`check-currency-status`) | Kun `flight_logs.user_id` | Både for høyt (turer man ikke fløy selv) og for lavt (turer der man er koblet, men ikke eier) |
| Personell-status/currency i UI (`useStatusData`) | Kun `flight_logs.user_id` | Samme feil som over: feil grønn/gul/rød på personellkort |
| Oppdrags-PDF, /status-aggregater, avvik | Teller flyturer på selskaps-/oppdragsnivå, ikke per pilot | Uendret, ingen feil |

## Foreslått fiks

1. **Database**: oppdater `recompute_profile_flyvetimer` til å summere koblede flyturer + egne flyturer uten personellkobling. Kjør en engangs-omberegning for alle profiler. Legg til trigger på `flight_logs` (INSERT/UPDATE/DELETE av `user_id`) slik at eier-baserte turer også trigger omberegning.
2. **Currency**: `check-currency-status` og `useStatusData` bytter til samme regel (hent `flight_log_personnel` for personene, pluss egne logger uten kobling), slik at varsler og statusfarger stemmer med loggboka.
3. **AI-risikovurdering**: `ai-risk-assessment` utvider pilothentingen med egne, ukoblede flyturer, slik at totaltimer og aktivitet siste 30/90 dager matcher loggboka.
4. Legg regelen ett sted i frontend (utvid `src/lib/pilotFlightLogs.ts`) og speil samme SQL-logikk i edge functions/DB, med kommentar som peker på felleskilden.

## Teknisk

- Filer: `src/lib/pilotFlightLogs.ts`, `src/hooks/useStatusData.ts`, `supabase/functions/check-currency-status/index.ts`, `supabase/functions/ai-risk-assessment/index.ts`, én migrasjon for `recompute_profile_flyvetimer` + backfill.
- Ytelse: hent koblinger i én `in(...)`-spørring per side, ikke per person.

## Verifisering

- Martin (Elverum vgs): loggbok, KPI, `profiles.flyvetimer` og currency-status skal alle vise 4t38m / samme antall turer.
- ELVIS (eier mange logger med andre piloter): skal ikke få kreditert andres flyturer.
- Sjekk at drone- og utstyrs-flytimer (egne triggere) ikke påvirkes.
