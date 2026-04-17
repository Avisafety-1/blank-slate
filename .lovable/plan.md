

## Mål
Verifisere at en underavdeling kan skrive loggføringsoppføringer (flytur, vedlikehold, manuelt) på en drone som er eid av mor-avdeling og delt nedover via `drone_department_visibility`.

## Utforskning

Jeg må sjekke RLS-policyer på følgende tabeller:
- `flight_logs` (DJI auto-sync + manuell loggføring)
- `drone_log_entries` / `drone_logbook_entries` (loggbok)
- `pending_dji_logs` (DJI auto-sync ventende)
- Eventuelt `mission_drones` for tilkobling

Vil sammenligne INSERT/UPDATE-policyer mot SELECT-arven (`get_user_visible_drone_ids` eller lignende) for å se om de speiler hverandre.

## Forventet rotårsak

Sannsynlig mønster: SELECT-policyer bruker `get_user_visible_company_ids()` eller `drone_department_visibility`-join, men INSERT-policyer sjekker bare `company_id = profile.company_id` på selve drone-raden. Det betyr at hvis dronen har `company_id = mor`, vil en bruker i barn-selskap ikke kunne sette inn loggrader fordi WITH CHECK feiler.

## Plan

### 1. Database-revisjon (read-only via supabase--read_query)
Hent alle RLS-policyer for de fire tabellene over. Sjekk:
- INSERT WITH CHECK
- UPDATE USING/WITH CHECK
- Hvilke helper-funksjoner brukes

### 2. Identifisere gap
For hver tabell der INSERT/UPDATE feiler for delt drone:
- Lag migrasjon som speiler arve-logikken fra SELECT-policyen (uten å løsne på selskapsisolasjon)
- Mønster: bruker kan skrive loggrad hvis `drone_id` er synlig via `drone_department_visibility` ELLER eies av et selskap i `get_user_visible_company_ids`

### 3. Frontend-sjekk
Bekrefte at `LogFlightTimeDialog`, `DroneLogbookDialog`, `process-dronelog` og `dji-process-single` faktisk setter `company_id` på loggraden til **brukerens** selskap (ikke dronens). Hvis de setter dronens `company_id`, kan rader bli "fanget" i mor-selskapet og bli usynlige for barn etterpå.

### 4. Migrasjon (kun ved behov)
Eksempel-mønster:
```sql
CREATE POLICY "Users can insert flight_logs for visible drones"
ON public.flight_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    drone_id IS NULL
    OR drone_id IN (SELECT id FROM drones WHERE company_id = ANY(get_user_visible_company_ids(auth.uid())))
    OR drone_id IN (SELECT drone_id FROM drone_department_visibility WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  )
);
```

### 5. Verifisering
- Logg inn som bruker i underavdeling
- Velg drone delt fra mor → kjør "Logg flytid" → skal lagres
- Sjekk at oppføringen vises i drone-loggboken etterpå (SELECT-arven fungerer allerede iht. memory)

### Filer
- Migrasjon for berørte INSERT/UPDATE-policyer (flight_logs, drone_log_entries, pending_dji_logs)
- Eventuelt mindre justering i edge functions hvis `company_id` settes feil

