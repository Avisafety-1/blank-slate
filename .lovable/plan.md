
# Effektivisering av oppdragslasting pa /oppdrag

## Problemet

Funksjonen `fetchMissions()` henter forst alle oppdrag, og kjorer deretter **8 separate Supabase-kall per oppdrag** i en lop:

1. `mission_personnel` (per oppdrag)
2. `mission_drones` (per oppdrag)
3. `mission_equipment` (per oppdrag)
4. `mission_sora` (per oppdrag)
5. `incidents` (per oppdrag)
6. `mission_risk_assessments` (per oppdrag)
7. `mission_documents` (per oppdrag)
8. `flight_logs` (per oppdrag)
9. `flight_log_personnel` (per flylogg, nestet)
10. `profiles` for opprettet-av (per oppdrag)

Med 20 oppdrag betyr det **160-200+ HTTP-kall** som alle ma fullores for siden vises. Dette er hovedarsaken til tregheten.

## Losningen: Batch-henting

I stedet for a hente relaterte data per oppdrag, henter vi **alle relaterte data i 8 bulk-kall** og kobler dem sammen i minnet:

```text
For (N oppdrag, ~10*N kall):         Etter (N oppdrag, ~10 kall):
mission_personnel x N        -->     mission_personnel .in(alle_ids) x 1
mission_drones x N           -->     mission_drones .in(alle_ids) x 1
mission_equipment x N        -->     mission_equipment .in(alle_ids) x 1
mission_sora x N             -->     mission_sora .in(alle_ids) x 1
incidents x N                -->     incidents .in(alle_ids) x 1
mission_risk_assessments x N -->     mission_risk_assessments .in(alle_ids) x 1
mission_documents x N        -->     mission_documents .in(alle_ids) x 1
flight_logs x N              -->     flight_logs .in(alle_ids) x 1
flight_log_personnel x M     -->     flight_log_personnel .in(alle_log_ids) x 1
profiles (created_by) x N    -->     profiles .in(alle_user_ids) x 1
```

**Resultat: Fra ~160 HTTP-kall til ~10 kall** (uavhengig av antall oppdrag).

## Hva pavirkes IKKE

- Ingen endring i UI, komponenter, eller props
- Identisk datastruktur returneres til resten av koden
- Offline-cache fungerer som for
- Realtime-oppdateringer fungerer som for
- Alle dialoger og eksportfunksjoner pavirkes ikke

## Teknisk detalj

**Fil:** `src/pages/Oppdrag.tsx`

**Endring i `fetchMissions()`** (linje 245-408):

1. Hent alle oppdrag (uendret)
2. Samle alle `mission.id`-verdier i en array
3. Kjor 8 parallelle bulk-kall med `.in('mission_id', missionIds)`
4. Samle alle unike `user_id`-verdier og hent profiler i ett kall
5. For flylogger: samle alle `flight_log_id` og hent piloter i ett kall
6. Bygg et Map per tabell (mission_id -> data[]) for rask oppslag
7. Kombiner alt i en enkel `.map()` uten async

Pseudokode for den nye logikken:
```text
const missionIds = data.map(m => m.id);

const [personnel, drones, equipment, sora, incidents, risks, docs, logs] = await Promise.all([
  supabase.from('mission_personnel').select('...').in('mission_id', missionIds),
  supabase.from('mission_drones').select('...').in('mission_id', missionIds),
  supabase.from('mission_equipment').select('...').in('mission_id', missionIds),
  supabase.from('mission_sora').select('...').in('mission_id', missionIds),
  supabase.from('incidents').select('...').in('mission_id', missionIds),
  supabase.from('mission_risk_assessments').select('...').in('mission_id', missionIds),
  supabase.from('mission_documents').select('...').in('mission_id', missionIds),
  supabase.from('flight_logs').select('...').in('mission_id', missionIds),
]);

// Group by mission_id using Maps
// Then combine in a simple synchronous .map()
```

## Ytterligere optimalisering: Skeleton loading

Siden cache allerede vises umiddelbart (linje 247-253), er den primaere flaskehalsen nettverkskallene. Batch-losningen reduserer ventetiden dramatisk.

## Risiko

- **Lav**: `.in()` med mange IDer er standard Supabase/PostgREST-funksjonalitet
- **Begrensning**: Supabase har en grense pa 1000 rader per kall. Hvis et selskap har >1000 oppdrag, bor det pagineres -- men dette er allerede en eksisterende begrensning
- **Testbar**: Resultatene er identiske, bare raskere
