

## Mål
Administratorer skal kunne redigere loggbøker — inkludert å endre tildelt pilot på en DJI-flylogg — også på tvers av underavdelinger i sitt hierarki. I dag blokkeres dette av RLS og manglende UI-tilgang.

## Funn

### RLS-problemer
| Tabell | Problem |
|---|---|
| `flight_logs` | Admin-policy bruker `get_user_company_id` (kun eget selskap, ikke underavdelinger). UPDATE krever `auth.uid() = user_id` — admin kan ikke redigere andres logger. |
| `flight_log_personnel` / `flight_log_equipment` | **Ingen UPDATE-policy** og ingen DELETE for admin → kan ikke bytte pilot på en eksisterende logg. |
| `drone_log_entries`, `equipment_log_entries`, `personnel_log_entries` | UPDATE krever `auth.uid() = user_id`. Admin kan ikke redigere andres oppføringer. DELETE har admin-policy, men den bruker `get_user_company_id` (ikke hierarki). |

### UI-problemer
- `UploadDroneLogDialog` har allerede full edit-flyt for DJI-logger (inkl. pilotbytte med justering av flytimer på `flight_log_personnel`), men det finnes **ingen "Rediger"-knapp** på flylogg-rader i `FlightLogbookDialog` / `DroneLogbookDialog` for å åpne den.
- Manuelle oppføringer i `DroneLogbookDialog`, `EquipmentLogbookDialog`, `FlightLogbookDialog` har kun "Slett" — ingen edit.

## Plan

### 1. Database — utvid RLS for hierarki + admin-redigering

Migrasjon (legges til, eksisterende policyer beholdes der mulig):

```sql
-- flight_logs: admin i hierarki kan redigere alt
DROP POLICY "Admins can manage all flight logs in own company" ON flight_logs;
CREATE POLICY "Admins can manage flight logs in visible companies"
  ON flight_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin') AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- flight_log_personnel + flight_log_equipment: admin kan UPDATE/DELETE/INSERT
CREATE POLICY "Admins can manage flight log personnel"
  ON flight_log_personnel FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM flight_logs fl WHERE fl.id = flight_log_id
    AND has_role(auth.uid(),'admin')
    AND fl.company_id = ANY(get_user_visible_company_ids(auth.uid()))));
-- (samme mønster for flight_log_equipment)

-- drone_log_entries / equipment_log_entries / personnel_log_entries:
-- legg til admin UPDATE-policy basert på hierarki
CREATE POLICY "Admins can update log entries in visible companies"
  ON drone_log_entries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin') AND company_id = ANY(get_user_visible_company_ids(auth.uid())));
-- + samme for equipment_log_entries og personnel_log_entries
-- + oppdatere eksisterende admin DELETE-policyer til å bruke get_user_visible_company_ids
```

### 2. UI — eksponer redigering for admin

**A. Flylogger (DJI/manuell) — `FlightLogbookDialog`, `DroneLogbookDialog`:**
- Legg til "Rediger"-knapp (Pencil-ikon) på flylogg-rader, synlig for `isAdmin`.
- Knappen åpner eksisterende `UploadDroneLogDialog` i edit-modus med `flightLogId` forhåndsutfylt. Dialogen støtter allerede pilotbytte, droneendring, tid, varighet osv.
- Verifisere at `UploadDroneLogDialog` kan åpnes med en initial `flightLogId` for redigering (sjekke om edit-flyten allerede har en ekstern entry-point — hvis ikke, legge til en `editFlightLogId`-prop).

**B. Manuelle loggbok-oppføringer — `DroneLogbookDialog`, `EquipmentLogbookDialog`, `FlightLogbookDialog`:**
- Legg til "Rediger"-knapp på manuelle oppføringer, synlig for `isAdmin` (eller egen oppføring).
- Gjenbruk det eksisterende "Legg til innlegg"-skjemaet i edit-modus (forhåndsutfylt med eksisterende verdier; lagring kjører `update` istedenfor `insert`).

### 3. Verifisering
- Som admin i mor-avdeling: åpne flylogg som tilhører bruker i underavdeling → "Rediger" → bytt pilot → bekreft at `flight_log_personnel` oppdateres og at flytimer justeres på begge piloter.
- Som admin: rediger en manuell drone-loggoppføring opprettet av annen bruker → bekreft lagring.
- Som vanlig bruker: bekreft at "Rediger"-knapp **ikke** vises på andres oppføringer.

### Filer
- Ny migrasjon for RLS-utvidelser (flight_logs, flight_log_personnel, flight_log_equipment, drone_log_entries, equipment_log_entries, personnel_log_entries).
- `src/components/UploadDroneLogDialog.tsx` — sikre ekstern entry-point for edit-modus (`editFlightLogId`-prop) hvis ikke allerede tilstede.
- `src/components/FlightLogbookDialog.tsx` — "Rediger"-knapp på flylogger + manuelle oppføringer.
- `src/components/resources/DroneLogbookDialog.tsx` — "Rediger"-knapp på flylogger + manuelle oppføringer.
- `src/components/resources/EquipmentLogbookDialog.tsx` — "Rediger"-knapp på manuelle oppføringer.

