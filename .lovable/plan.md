

## Varsel for aktive flyturer over 3 timer

### Hva
Ny edge function som kjøres periodisk (cron), finner aktive flyturer som har pågått i over 3 timer, og sender push-varsel + e-post til piloten med påminnelse om å avslutte flyturen.

### Ny edge function: `check-long-flights/index.ts`

1. Query `active_flights` der `start_time < now() - 3 timer`
2. For å unngå gjentatte varsler: sjekk mot en ny kolonne `long_flight_notified_at` på `active_flights` — hopp over flyturer som allerede er varslet
3. For hver treff:
   - Hent pilotens profil (e-post, navn) via `profile_id` → `profiles` + `auth.users`
   - Send push-varsel via `send-push-notification` (intern invoke)
   - Send e-post via SMTP (bruk `email-config.ts` shared-logikk)
   - Oppdater `long_flight_notified_at = now()` på flyturen

### Database-migrasjon
- Legg til kolonne `long_flight_notified_at timestamptz` (nullable) på `active_flights` for å spore at varsel er sendt

### Config
- `supabase/config.toml`: legg til `[functions.check-long-flights]` med `verify_jwt = false`

### Cron-jobb (SQL, kjøres via Supabase SQL Editor)
- Schedule `check-long-flights` hver 15. minutt for å fange opp flyturer som passerer 3-timersgrensen

### E-postinnhold
- Tittel: "Påminnelse: Du har en aktiv flytur"
- Innhold: "Du har en pågående flytur som har vart i over 3 timer. Har du glemt å avslutte den? Logg inn i Avisafe for å avslutte flyturen."

### Push-innhold
- Tittel: "Aktiv flytur pågår"
- Body: "Du har en flytur som har vart over 3 timer. Har du glemt å avslutte?"
- URL: "/" (dashboard)

