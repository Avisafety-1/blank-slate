
# Fiks: «Feil ved sletting av bruker»

## Årsak

Edge-funksjonen `admin-delete-user` feiler fordi den ikke sletter data fra alle tabeller som har foreign keys til `profiles` eller `auth.users`. Feilen er konkret:

```
update or delete on table "profiles" violates foreign key constraint
"mission_risk_assessments_pilot_id_fkey" on table "mission_risk_assessments"
```

## Manglende tabeller

Funksjonen rydder i dag opp i en del tabeller, men mangler disse:

| Tabell | Kolonne | Refererer til | Data for Ivar |
|--------|---------|---------------|---------------|
| `mission_risk_assessments` | `pilot_id` | `profiles` | 2 rader |
| `personnel_competencies` | `profile_id` | `profiles` | 1 rad |
| `incident_comments` | `user_id` | `auth.users` | 2 rader |
| `flight_log_personnel` | `profile_id` | `profiles` | 1 rad |
| `map_viewer_heartbeats` | `user_id` | `auth.users` | 2 rader |
| `push_subscriptions` | `user_id` | `auth.users` | 0 rader |
| `mission_sora` | `prepared_by` / `approved_by` | `auth.users` | Ukjent |
| `mission_personnel` | `profile_id` | `profiles` | 0 rader |
| `drone_personnel` | `profile_id` | `profiles` | 0 rader |

I tillegg er det kolonner som bor settes til NULL i stedet for a slette raden:
- `incidents.oppfolgingsansvarlig_id` (settes til NULL)
- `missions.approved_by` (settes til NULL)
- `profiles.approved_by` (settes til NULL, andre brukeres profiler)

## Losning

Oppdatere `supabase/functions/admin-delete-user/index.ts` med komplett opprydding for ALLE relaterte tabeller. Rekkefølgen er viktig pga. foreign key-avhengigheter.

### Ny sletterekkefølge (legges til for eksisterende kode):

```text
1. mission_risk_assessments  (DELETE WHERE pilot_id = targetUserId)
2. mission_personnel         (DELETE WHERE profile_id = targetUserId)
3. mission_sora              (SET NULL prepared_by/approved_by)
4. missions                  (SET NULL approved_by)
5. personnel_competencies    (DELETE WHERE profile_id = targetUserId)
6. incident_comments         (DELETE WHERE user_id = targetUserId)
7. incidents                 (SET NULL oppfolgingsansvarlig_id)
8. flight_log_personnel      (DELETE WHERE profile_id = targetUserId)
9. drone_personnel           (DELETE WHERE profile_id = targetUserId)
10. push_subscriptions       (DELETE WHERE user_id = targetUserId)
11. map_viewer_heartbeats    (DELETE WHERE user_id = targetUserId)
12. profiles                 (SET NULL approved_by WHERE approved_by = targetUserId)
```

Deretter kjores den eksisterende slettingen (flight_logs, drones, equipment, osv.).

### Endret fil

**`supabase/functions/admin-delete-user/index.ts`** -- legge til alle manglende DELETE/SET NULL-operasjoner for tabellene i listen. Funksjonen deployes automatisk.

## Etter implementering

Sletting av brukeren "Ivar Moen" (ID: `66546c88-...`) skal fungere etter at endringen er deployet.
