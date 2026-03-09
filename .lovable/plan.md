

## Plan: Forenkle brukersletting — SET NULL i stedet for DELETE

### Problem
Nåværende `admin-delete-user` sletter all data knyttet til brukeren (droner, utstyr, oppdrag, hendelser, dokumenter, flylogg osv.). Dette er unødvendig destruktivt — dataene tilhører bedriften, ikke brukeren.

### Tilnærming
Erstatt alle DELETE-operasjoner med `UPDATE ... SET user_id/profile_id = NULL`, unntatt:
- **user_roles** — må slettes (ingen mening uten bruker)
- **profiles** — må slettes (1:1 med auth.users)
- **push_subscriptions**, **map_viewer_heartbeats**, **calendar_subscriptions**, **active_flights**, **notification_preferences** — ren session/device-data, kan slettes
- **auth.users** — slettes til slutt

### Komplett liste over tabeller og handling

**SET NULL** (behold raden, fjern brukerreferansen):
| Tabell | Kolonne |
|--------|---------|
| calendar_events | user_id |
| customers | user_id |
| dji_credentials | user_id |
| documents | user_id |
| drone_accessories | user_id |
| drone_equipment_history | user_id |
| drone_inspections | user_id |
| drone_log_entries | user_id |
| drone_personnel | profile_id |
| drones | user_id |
| dronetag_devices | user_id |
| equipment | user_id |
| equipment_log_entries | user_id |
| flight_log_personnel | profile_id |
| flight_logs | user_id |
| incident_comments | user_id |
| incident_eccairs_mappings | created_by |
| incidents | user_id |
| incidents | oppfolgingsansvarlig_id |
| mission_personnel | profile_id |
| mission_risk_assessments | pilot_id |
| mission_sora | prepared_by, approved_by |
| missions | user_id, approved_by |
| news | user_id |
| pending_dji_logs | user_id |
| personnel_competencies | profile_id |
| personnel_log_entries | profile_id, user_id |
| profiles | approved_by |

**DELETE** (session/bruker-spesifikk data):
- push_subscriptions, map_viewer_heartbeats, calendar_subscriptions, active_flights, notification_preferences, user_roles, profiles

### Databasemigrasjon
Noen kolonner kan ha `NOT NULL`-constraint som hindrer SET NULL. Må kjøre en migrasjon for å endre disse til nullable der det trengs (f.eks. `drones.user_id`, `flight_logs.user_id`, `missions.user_id`).

### Filer som endres
1. **`supabase/functions/admin-delete-user/index.ts`** — erstatt alle delete-kall med update-set-null, behold delete kun for session-tabeller + user_roles + profiles
2. **Database-migrasjon** — gjør relevante user_id/profile_id-kolonner nullable der de ikke allerede er det

