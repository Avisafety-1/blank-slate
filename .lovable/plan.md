## Hva som er galt

For oppdraget «Førsvatn kartlegging vei» (Norconsult, avd. Bergen) viser AI-risikovurderingen at piloten Jan Amund Walde har **0,28 timer** totalt. Det stemmer at `profiles.flyvetimer` for ham er **0,28** — men `flight_logs` summerer til **9,97 timer** (15 logger).

**Årsak:** AI-risikofunksjonen (`supabase/functions/ai-risk-assessment/index.ts`, linje 724 + 1461) henter `totalFlightHours` fra feltet `profiles.flyvetimer`. Det feltet oppdateres **ikke** automatisk når en ny `flight_logs`-rad legges inn — det finnes triggere som vedlikeholder `drones.flyvetimer` og `equipment.flyvetimer`, men ingen tilsvarende for `profiles`. Kun den gamle import-/manuell-loggføringsflyten (`FlightLogbookDialog.tsx`) skriver til feltet, så for piloter som logger via `LogFlightTimeDialog` / opplastede dronelogger blir verdien stående på det den var ved oppstart.

Det betyr at AI-en får helt feil totalflytid for nesten alle aktive piloter, og kategorien "Piloterfaring" blir kunstig lav.

## Fiks

### 1. AI-risikofunksjonen — bruk faktiske flight_logs
`supabase/functions/ai-risk-assessment/index.ts`:
- Vi har allerede `pilotFlightStats` (linje 791–801) som summerer `flight_duration_minutes` per pilot fra `flight_logs`.
- Endre `assignedPilots.map(...)` (linje 1458–1462) slik at `totalFlightHours` hentes som `pilotFlightStats.find(s => s.pilotId === p.id)?.totalMinutes / 60` (avrundet til 2 desimaler), med fallback til `p.flyvetimer || 0` hvis det ikke finnes loggdata.
- Ingen endring i prompt/kategori-logikk — AI-en får bare riktig tall inn.

### 2. (Anbefalt) Trigger som holder `profiles.flyvetimer` synk
For at Resources, Status-siden, dashboard-kort og PDF-eksport også skal vise riktig sum, legge til en database-trigger på `flight_logs` (INSERT / UPDATE / DELETE) som regner ut `SUM(flight_duration_minutes)/60` for `user_id` og oppdaterer `profiles.flyvetimer` — samme mønster som `update_drone_flight_hours_on_log`. Inkluderer en éngangs-backfill:
```sql
UPDATE profiles p SET flyvetimer = COALESCE(s.hours, 0)
FROM (SELECT user_id, SUM(flight_duration_minutes)/60.0 AS hours
      FROM flight_logs GROUP BY user_id) s
WHERE p.id = s.user_id;
```
Den manuelle `update flyvetimer`-koden i `FlightLogbookDialog.tsx` (linje 158) kan stå — trigger vil overskrive med korrekt sum uansett.

## Resultat

- Jan Amund Walde får `totalFlightHours ≈ 9,97` i neste AI-risikovurdering, og «Piloterfaring»-kategorien får riktig grunnlag.
- Alle andre piloter får tilsvarende korreksjon med én gang backfill kjøres.
- Loggføring framover holder seg automatisk i synk.

Skal jeg gjøre begge endringene (1 + 2), eller bare punkt 1 (kun AI-fiks, uten trigger / backfill)?
