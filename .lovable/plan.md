## Problem
Når batch-behandling oppretter et nytt oppdrag, blir dronen ikke koblet til oppdraget under «Droner», selv om `flight_logs.drone_id` settes korrekt.

## Årsak
`BatchLogPanel.tsx` bruker `supabase.from("mission_drones").upsert(..., { onConflict: "mission_id,drone_id" })`, men tabellen `mission_drones` har ingen UNIQUE-constraint på `(mission_id, drone_id)`. PostgREST returnerer derfor en feil som ignoreres (vi sjekker ikke `error`), og raden blir aldri lagt inn. `mission_equipment` og `mission_personnel` har slike unique-constraints, og fungerer derfor.

Bekreftet i databasen: ett nylig batch-opprettet oppdrag har `flight_logs.drone_id` satt (MAVIC 2) men `mission_drones`-tabellen har 0 rader for oppdraget.

## Endringer

1. **Migrasjon** — legg til manglende unik constraint:
   ```sql
   ALTER TABLE public.mission_drones
     ADD CONSTRAINT mission_drones_mission_id_drone_id_key
     UNIQUE (mission_id, drone_id);
   ```
   (Først rydde eventuelle duplikater hvis de finnes.)

2. **`src/components/upload/BatchLogPanel.tsx`** — sjekk `error` fra mission_drones/mission_personnel/mission_equipment upsertene og kast feilen så lagringen merkes som feilet i stedet for å gå videre stille.

## Effekt
Nye batch-lagrede oppdrag vil ha dronen synlig under «Droner» på oppdragskortet. Eksisterende oppdrag uten kobling må evt. rettes manuelt (åpne oppdraget og legg til dronen) — si fra hvis du vil at jeg lager en backfill basert på `flight_logs.drone_id`.
