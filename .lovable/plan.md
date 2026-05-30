## Mål

Legge til en "Test-modus" toggle under SafeSky callsign-innstillingene. Når aktivert publiseres alle SafeSky-posisjoner med høyde 0 ft AMSL og status `GROUNDED`, slik at man kan teste integrasjonen uten å vise drone som flygende i lufta.

## Endringer

### 1. Database (migrasjon)
- `companies.safesky_callsign_test_mode boolean NOT NULL DEFAULT false`
- Inkluder kolonnen i eksisterende propagasjons-trigger for callsign-innstillinger (samme som `safesky_callsign_prefix`/`_variable` propageres til underavdelinger når `safesky_callsign_propagate = true`).

### 2. UI (`src/components/admin/ChildCompaniesSection.tsx`)
- Ny `Switch` "Test-modus (publiser 0 ft / on ground)" i `SafeSky callsign`-seksjonen, plassert over propager-toggle.
- Liten beskrivelse: "All trafikk publiseres med høyde 0 og status GROUNDED. Bruk for å teste uten å vise drone i lufta."
- Disabled når seksjonen er låst av forelder.
- Inngår i `safesky_callsign_propagate`-låsen for barneavdelinger (arver fra forelder når propagering er på).
- Inkludert i save-payload sammen med eksisterende callsign-felt.

### 3. Edge functions

`supabase/functions/safesky-advisory/index.ts`:
- Last `safesky_callsign_test_mode` sammen med callsign-prefix/variable (med samme parent-fallback).
- Når `testMode === true`:
  - `publish_point_advisory` / `refresh_point_advisory`: `max_altitude = 0`.
  - `publish_advisory` / `refresh_advisory`: `max_altitude = 0`.
  - `publish_live_uav`: `altitude = 0`, `status = "GROUNDED"` (status er allerede hardkodet GROUNDED, men logges eksplisitt som test).
  - `publish` / `refresh` UAV-beacon: `altitude = 0`.
- Log linje `[TEST MODE] callsign=… altitude forced to 0` for sporbarhet.

`supabase/functions/safesky-cron-refresh/index.ts`:
- Samme lookup av `safesky_callsign_test_mode` med parent-fallback.
- Sett `max_altitude = 0` på advisory-payloaden når aktivert.

### 4. Memory
- Oppdater `mem://integrations/safesky/unified-implementation` med en kort note om test-modus (alle posisjoner publiseres som 0 ft / GROUNDED når togglet er på).

## Ikke i scope
- Egen "test"-API-nøkkel/sandkasse-bytte — vi bruker fortsatt samme nøkler. Test-modus handler kun om hva som rapporteres (høyde + status), ikke hvilken miljø-nøkkel som brukes.
- Skjule advisory fra SafeSky helt — den publiseres fremdeles, bare med 0 ft.
