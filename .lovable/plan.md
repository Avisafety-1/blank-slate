## Mål

Én sannhetskilde for pilotens flytid: `flight_logs` + `flight_log_personnel`. `profiles.flyvetimer` blir en automatisk cache. Ingen flytid skal forsvinne, og alle eksisterende skjermbilder skal vise samme tall etterpå.

## Sikkerhetsnett (gjøres FØR migrasjoner)

1. **Sikkerhetskopi som CSV** — eksporter `profiles(id, full_name, flyvetimer)` og `flight_logs(id, user_id, flight_duration_minutes, flight_date)` til `/mnt/documents/` så vi kan reversere hvis noe blir feil.
2. **Snapshot-tabell i databasen** — opprett `_backup_flyvetimer_2026_06_22(profile_id, flyvetimer_before)` slik at vi kan rulle tilbake `profiles.flyvetimer` med én SQL hvis ønskelig.
3. **Tørr-kjøring i SELECT** — kjør alle backfill-spørringene som SELECT først og dobbeltsjekk totalsummene før vi gjør om til INSERT/UPDATE.

## Migrasjon 1 — Backfill personnel-koblingen (data-fix, ikke skjemaendring)

Kopier `flight_logs.user_id` inn i `flight_log_personnel` der koblingen mangler. Endrer ingen rad som allerede er koblet:

```sql
INSERT INTO flight_log_personnel (flight_log_id, profile_id)
SELECT fl.id, fl.user_id
FROM flight_logs fl
WHERE fl.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM flight_log_personnel flp
    WHERE flp.flight_log_id = fl.id AND flp.profile_id = fl.user_id
  );
```

**Forventet resultat:** ~212 nye rader, ~401 t som nå blir synlig via junctionen. Ingen `flight_logs`-rad eller eksisterende personnel-rad endres.

Kjøres som data-operasjon (insert-verktøyet), ikke migrasjon.

## Migrasjon 2 — Migrer «legacy startbalanse» til ekte flight_logs-rader

For profiler der `profiles.flyvetimer` etter migrasjon 1 fortsatt er større enn `SUM(personnel-koblede logger)/60` (dvs. timer som bare eksisterer i scalar-feltet — typisk fra «Legg til flytimer manuelt» eller dubletter), opprett **én** `flight_logs`-rad per pilot:

- `flight_date` = `profiles.created_at` (enkelt og forklarbart).
- `flight_duration_minutes` = `(profile.flyvetimer * 60) - sum(personnel-minutter)`.
- `notes = 'Startbalanse migrert fra profil ved opprydding 2026-06-22'`.
- `operation_type = 'VLOS'`, `departure_location = 'Migrert'`, `landing_location = 'Migrert'`, `movements = 0`.
- `drone_id = NULL` (ingen kobling til drone, så drone-statistikk påvirkes ikke).
- `company_id = profile.company_id`, `user_id = profile.id`.
- Etterpå: `INSERT INTO flight_log_personnel (flight_log_id, profile_id)` for samme pilot.

**Forventet resultat:** ~9-26 nye `flight_logs`-rader (et lavt antall), totalt ~98 t. Etter dette = `SUM(personnel-koblede logger)/60 = profiles.flyvetimer` for alle profiler.

Vi flagger disse radene tydelig i UI (se kodepunkt 5) slik at de ikke forveksles med ekte flyturer.

## Migrasjon 3 — Ny trigger basert på personnel-junction (skjema)

Erstatter trigger og funksjon fra forrige migrasjon. Ny logikk:

```text
recompute_profile_flyvetimer(_profile_id uuid):
  UPDATE profiles SET flyvetimer = (
    SELECT COALESCE(SUM(fl.flight_duration_minutes), 0) / 60.0
    FROM flight_logs fl
    JOIN flight_log_personnel flp ON flp.flight_log_id = fl.id
    WHERE flp.profile_id = _profile_id
  )
  WHERE id = _profile_id;
```

To triggere, begge `SECURITY DEFINER`:

- På `flight_logs` (AFTER INSERT/UPDATE OF flight_duration_minutes/DELETE): hent alle `profile_id` fra `flight_log_personnel` for raden og kall funksjonen for hver.
- På `flight_log_personnel` (AFTER INSERT/DELETE): kall funksjonen for `NEW.profile_id` / `OLD.profile_id`.

DROP gammel trigger `trg_update_profile_flight_hours` og gammel funksjon `update_profile_flight_hours_on_log` først.

**Sluttverifisering i samme migrasjon:** kjør én engangs full backfill av `profiles.flyvetimer` via den nye funksjonen for alle profiler. Da er cachen garantert korrekt direkte etter migrasjonen.

## Kodeendringer (etter at migrasjonene er godkjent og kjørt)

### 4. `src/components/FlightLogbookDialog.tsx`
- **Linje 149-192 (`handleAddManualHours`):** i stedet for `update profiles set flyvetimer = newTotal`, opprett en `flight_logs`-rad (samme felter som migrasjon 2 over, men `flight_date = now()`, `notes = 'Manuelt registrert tilleggstid'`) og en `flight_log_personnel`-rad. Trigger oppdaterer `profiles.flyvetimer` automatisk. Behold `personnel_log_entries`-noten for tekstvisning i tidslinjen.
- **Linje 252 (`totalFlytid`):** fjern `+ profileFlyvetimer * 60`. Totalen kommer nå utelukkende fra logger som vises i listen.
- **`fetchFlightLogs` (linje 194-242):** bekreft at den henter via `flight_log_personnel` (det gjør den allerede). Ingen endring.

### 5. `src/components/FlightLogbookDialog.tsx` — visuell merking
Når en log-rad har `notes LIKE 'Startbalanse migrert%'` eller `'Manuelt registrert%'`, vis en badge «Manuell» / «Startbalanse» og skjul drone-/lokasjon-feltene som ikke gir mening. Sikrer at brukere ser hva som er importert vs. ekte flytur.

### 6. `supabase/functions/ai-risk-assessment/index.ts`
- **`pilotFlightStats` (linje 791-801):** bytt fra `flight_logs.user_id = pilot.id` til join via `flight_log_personnel.profile_id = pilot.id`. Da matcher AI det loggboken viser.
- **`assignedPilots.map` (linje 1458-1462):** beholder logikken fra forrige fix (`pilotFlightStats … / 60`, fallback til `profiles.flyvetimer`).

### 7. `src/components/resources/PersonnelFlightKpi.tsx` og andre lesere
Sjekk at de leser fra `flight_logs` (via personnel-junction) eller fra `profiles.flyvetimer`. Etter migrasjon 3 vil begge gi samme tall, så ingen endring er nødvendig — men vi verifiserer at KPI-en på Resources-siden viser samme totalsum som loggboken for noen test-piloter.

## Verifisering etter implementasjon

For hver av disse pilotene sjekker vi at tallet er likt på alle 4 stedene (Profil-KPI, Loggbok-totalsum, AI-risikovurdering, `profiles.flyvetimer` i DB):

- Gard Haug-Hansen (forventet ~319 t etter migrasjon 1, ~319 t etter migrasjon 3)
- Jan Amund Walde (forventet ~10 t)
- Erlend Alvestad (forventet ~6 t, fra startbalanse-raden)
- En tilfeldig pilot uten avvik som kontroll

Hvis tallet er likt på alle 4 stedene for alle 4 pilotene = grønt lys. Hvis ikke = roll back via `_backup_flyvetimer_2026_06_22`.

## Hva som IKKE skjer (trygghet)

- Vi sletter aldri en `flight_logs`-rad.
- Vi rører aldri `drones.flyvetimer` eller `equipment.flyvetimer` — de har egne triggere som fortsatt fungerer.
- Vi rører aldri DJI-import-flyten (`UploadDroneLogDialog`, `dji-process-single`). Den fortsetter å skrive `user_id`, og backfillen sørger for at personnel-junctionen oppdateres automatisk fremover via en liten tilleggsfiks: vi legger til samme INSERT i `UploadDroneLogDialog.tsx` linje 1958-ish (etter at `flight_logs.insert` returnerer `logData.id`, sett `flight_log_personnel(flight_log_id=logData.id, profile_id=user.id)` hvis user ikke allerede er i `selectedPersonnel`). Dette er en 5-linjers patch og hindrer at problemet kommer tilbake.
- Profildubletter (Rikard) tar vi **ikke** opp i denne planen — krever manuell vurdering av hvilken som skal beholdes. Etter migrasjon 2 vil dubletten med 49 t få én startbalanse-rad, så datasettet er konsistent uansett.

## Rekkefølge

1. CSV-backup + snapshot-tabell.
2. Migrasjon 1 (backfill personnel) → verifiser radtall.
3. Migrasjon 2 (startbalanse-rader) → verifiser at sum personnel = profile for alle.
4. Migrasjon 3 (ny trigger + reset).
5. Kodefiks (FlightLogbookDialog + ai-risk-assessment + UploadDroneLogDialog).
6. Manuell verifisering på 4 piloter.
7. Hvis OK: behold backup-tabellen i 30 dager, så slett.