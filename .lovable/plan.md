## Problem

Når man legger til flytimer manuelt opprettes det **to** rader:
1. En `flight_logs`-rad med `entry_source='manual'` → påvirker total flytid + vises under "Flyturer".
2. En `personnel_log_entries`-rad (tidslinjenotat) → vises under "Logginnlegg".

`handleDeleteEntry` sletter kun `personnel_log_entries`-raden. `flight_logs`-raden blir liggende, så totalen og "Flyturer"-listen endres ikke.

## Løsning: koble logginnlegget til flight_log og kaskadeslett

### 1. Migrasjon
- Legg til `flight_log_id UUID NULL REFERENCES flight_logs(id) ON DELETE SET NULL` på `personnel_log_entries`.
- Index på `flight_log_id`.
- Backfill: for eksisterende `personnel_log_entries` med `entry_type='flytid'` og `title ILIKE 'Manuelt lagt til%'`, finn matchende `flight_logs`-rad (samme `profile_id` via `flight_log_personnel`, `entry_source='manual'`, samme `entry_date` = `flight_date::date`, varighet utledet fra title) og sett `flight_log_id`. Best-effort — der det er flere kandidater på samme dag/varighet, ta den nyeste som ikke allerede er lenket.

### 2. `FlightLogbookDialog.tsx` — `handleAddManualHours`
Etter at `flight_logs`-raden og `flight_log_personnel`-koblingen er opprettet, sett `flight_log_id: newLog.id` på `personnel_log_entries.insert(...)`.

### 3. `FlightLogbookDialog.tsx` — `fetchPersonnelLogs`
Hent også `flight_log_id` slik at `handleDeleteEntry` har den tilgjengelig.

### 4. `FlightLogbookDialog.tsx` — `handleDeleteEntry`
Endre signatur til å motta hele entry. Hvis `entry.flight_log_id`:
1. Slett `flight_log_personnel` der `flight_log_id = entry.flight_log_id`.
2. Slett `flight_logs` der `id = entry.flight_log_id`. (DB-trigger trekker timene fra `profiles.flyvetimer`.)
3. Slett `personnel_log_entries`-raden.
4. Kjør `fetchFlightLogs()` + `fetchProfileData()` + `fetchPersonnelLogs()`.

Hvis ingen `flight_log_id` (vanlig logginnlegg uten flytid) → behold dagens oppførsel (slett bare entry).

## Hva som IKKE endres
- `entry_source`-kolonnen, total/manuell-splittingen, PDF — alt fungerer som før.
- Vanlige logginnlegg (notat, hendelse osv.) påvirkes ikke.

## Verifisering
1. Legg til 1t manuelt → totalt og "Manuelt lagt til" øker, rad i begge tabber.
2. Slett raden under "Logginnlegg" → totalt og "Manuelt lagt til" reduseres med 1t, raden forsvinner også fra "Flyturer".
3. Gamle eksisterende manuelle innlegg (Gard sine 10t-rader) skal også kunne slettes og fjerne tilhørende flight_logs etter backfill.
