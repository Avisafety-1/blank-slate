
# Vis tilknyttede ressurser i oppdragskortet (MissionDetailDialog)

## Hva endres?

MissionDetailDialog viser i dag kun lokasjon, tidspunkt, status, vurderingsbadger, kart, beskrivelse og merknader. Vi legger til seksjoner for:

- **Personell** (tilknyttede piloter/observatorer)
- **Droner** (tilknyttede droner med modell og serienummer)
- **Utstyr** (tilknyttet utstyr med type og navn)
- **Kunde** (kundenavn fra oppdraget, vises allerede i datamodellen)
- **Opprettet av** (hvem som opprettet oppdraget)

## Strategi: Dialogen henter selv

MissionDetailDialog brukes fra 9 ulike steder i appen. Noen av disse (f.eks. Oppdrag.tsx) sender allerede med `personnel`, `drones`, `equipment` -- andre gjor det ikke. For a sikre konsistent opplevelse **uten a endre noen av de 9 kallstedene**, vil dialogen selv hente ressursdata nar den apnes.

Logikken:
1. Nar `open` blir `true` og `mission.id` finnes, kjor 3 raske Supabase-kall (personnel, drones, equipment)
2. Lagre i lokal state i dialogen
3. Vis dataene i pene seksjoner mellom "Tidspunkt" og "Kartvisning"
4. Hvis data allerede finnes pa mission-objektet (fra Oppdrag.tsx), bruk det direkte uten ny henting

## Hva pavirkes IKKE

- Ingen endring i noen av de 9 filene som bruker MissionDetailDialog
- Ingen endring i props-grensesnittet
- Ingen endring i Supabase-skjema eller RLS
- Eksisterende funksjonalitet (redigering, risikovurdering, varkort) forblir identisk

## Visuelt design

Nye seksjoner plasseres etter "Tidspunkt" og for "Kartvisning":

```text
+------------------------------------------+
| [Kunde-ikon]  Kunde                      |
|               Vy                         |
+------------------------------------------+
| [Person-ikon] Personell                  |
|               - Ola Nordmann (Pilot)     |
|               - Kari Hansen (Observator) |
+------------------------------------------+
| [Drone-ikon]  Drone                      |
|               - DJI Mavic 3 (SN-12345)  |
+------------------------------------------+
| [Utstyr-ikon] Utstyr                    |
|               - Termokamera (Sensor)     |
|               - Batteri #3 (Batteri)     |
+------------------------------------------+
| [Bruker-ikon] Opprettet av               |
|               Per Olsen                   |
+------------------------------------------+
```

Hvis en seksjon er tom (ingen personell/droner/utstyr), vises den ikke -- akkurat som "Beskrivelse" og "Merknader" i dag.

## Teknisk detalj

**Fil som endres:** `src/components/dashboard/MissionDetailDialog.tsx`

Endringer:
1. Importer `useEffect` og `supabase`-klienten
2. Legg til ikoner: `Users`, `Plane`, `Wrench`, `Building2`, `User`
3. Legg til `useEffect` som henter `mission_personnel`, `mission_drones`, `mission_equipment` nar dialogen apnes
4. Bruk allerede tilgjengelige felter: `mission.kunde` (kundenavn) og `mission.created_by_name` (opprettet av)
5. Legg til de nye seksjonene i JSX mellom tidspunkt og kartvisning
6. Smart data-kilde: sjekk om `mission.personnel` allerede finnes for a unnga unodvendig henting
