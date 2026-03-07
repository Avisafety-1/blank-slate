
Mål: Stabilisere hele vedlikeholds-/inspeksjonsflyten slik at status ikke hopper mellom grønn/rød etter «Utfør inspeksjon», og at alle vedlikeholdsinnganger bruker samme logikk.

Hva jeg fant (rotårsaker)
1) Kritisk i `/ressurser`: `fetchDrones()` beregner nye statuser, men setter aldri `setDrones(dronesWithStatus)`.
   - Effekt: UI blir stående på cache/stale data.
   - Dette matcher observasjonen «grønn så rød igjen» etter toast.

2) Cache overskriver fersk status:
   - `fetchDrones()` gjør `setDrones(cached)` først, også ved manuell refresh etter inspeksjon.
   - Når cache er gammel, kan den midlertidig (eller permanent pga punkt 1) sette status tilbake.

3) Kalenderflyt er ikke lik dronekort-flyt:
   - `src/pages/Kalender.tsx` lagrer `sist_inspeksjon` som dato (midnatt), ikke full timestamp.
   - Oppdaterer ikke `hours_at_last_inspection` og `missions_at_last_inspection`.
   - Derfor kan status forbli rød selv etter «fullført vedlikehold» fra kalender.

4) Telling av oppdrag «siden inspeksjon» er ikke unik:
   - Koden sier «Count unique missions», men teller rader i `flight_logs`.
   - Flere flight-log-rader for samme mission kan gi falsk høy bruk og rød status.

5) Tidspunkt kan tapes ved manuell redigering:
   - I drone-redigering brukes `type="date"` for `sist_inspeksjon` og lagrer dato uten klokkeslett.
   - Dette kan reintrodusere midnatt-problemet etter at timestamp-fix er på plass.

Implementasjonsplan
Fase 1: Stabil hotfix (høy prioritet)
A) `/ressurser` state-fix
- Legg inn `setDrones(dronesWithStatus)` i `fetchDrones()`.
- Sørg for at cache oppdateres med samme `dronesWithStatus`.

B) Unngå stale cache-tilbakefall etter mutasjon
- Gjør `fetchDrones` støtte `preferFresh`/`skipCacheHydration` (eller tilsvarende).
- Kall fra `onDroneUpdated` med fresh-first, slik at cache ikke skriver over ny status rett etter inspeksjon.

C) Kalender-inspeksjon lik dronekort
- I `performMaintenanceUpdate` for `sourceTable === 'drones'`:
  - bruk `now = new Date().toISOString()` for `sist_inspeksjon`
  - oppdater også `hours_at_last_inspection` (fra gjeldende `flyvetimer`)
  - beregn/lagre `missions_at_last_inspection` konsistent med samme tellelogikk
- Behold logging i `drone_inspections`.

Fase 2: Konsistens i vedlikeholdslogikk
D) Felles helper for drone-inspeksjon
- Ekstraher én delt funksjon (f.eks. `src/lib/droneInspection.ts`) som utfører:
  - timestamp-sett
  - neste_inspeksjon-beregning
  - snapshot-reset (`hours_at_last_inspection`, `missions_at_last_inspection`)
  - insert i `drone_inspections`
- Brukes av:
  - `DroneDetailDialog` (manuell + sjekkliste)
  - `Kalender` (mark maintenance complete)

E) Korrekt missions-telling (unik mission_id)
- Erstatt row-count med unik telling av `mission_id` (Set/distinct-strategi).
- Bruk samme funksjon i:
  - `useStatusData.ts`
  - `Resources.tsx`
  - `DroneDetailDialog.tsx` (`fetchMissionsSinceInspection`)

Fase 3: Hardening av UI/format
F) Bevar klokkeslett ved redigering av `sist_inspeksjon`
- Ikke overskriv timestamp utilsiktet ved «Lagre» når bruker kun endrer andre felt.
- Enten:
  - egen datetime-input, eller
  - behold eksisterende timestamp hvis feltet ikke aktivt ble endret.

G) Bedre umiddelbar UI-konsistens
- Etter vellykket inspeksjon: oppdater lokal `drone`-state optimistisk med nytt `sist_inspeksjon` og snapshots før refetch.
- Reduser «grønn -> rød -> grønn»-flimmer ved å unngå stale prop-overskriving.

Berørte filer
- `src/pages/Resources.tsx`
- `src/components/resources/DroneDetailDialog.tsx`
- `src/pages/Kalender.tsx`
- `src/hooks/useStatusData.ts`
- Ny helper: `src/lib/droneInspection.ts` (foreslått)

Tekniske detaljer (kort)
- Nåværende flyt i `/ressurser`:
```text
onDroneUpdated()
 -> fetchDrones()
    -> setDrones(cached)   (gammel status)
    -> hent fresh + beregn
    -> (mangler setDrones(fresh))
```
Dette er hovedårsaken til at status «kommer tilbake».

Verifiseringsplan etter implementasjon
1) Dronekort i `/ressurser`:
   - Sett intervall oppdrag=1, utfør inspeksjon.
   - Status skal bli og forbli grønn etter toast.
2) Samme test via sjekkliste-inspeksjon.
3) Samme test via kalender «registrer utført».
4) Opprett flere `flight_logs` med samme `mission_id` og verifiser at bare unike missioner teller.
5) Last siden på nytt (cache) og bekreft at status fortsatt er korrekt.
