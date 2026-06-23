## Endring

Når en bruker huker av en drone i AddMissionDialog, skal alt utstyr som er knyttet til den dronen (via `drone_equipment`) automatisk legges til i `selectedEquipment`.

### Implementasjon

`src/components/dashboard/AddMissionDialog.tsx` — oppdater `toggleDrone` (linje 1084):

- Når en drone legges til (ikke fjernes):
  1. Hent `equipment_id` fra `drone_equipment` der `drone_id = droneId`.
  2. Merge inn i `selectedEquipment` (dedupliser, ikke fjern noe eksisterende).
- Ved fjerning av drone: ingen endring i utstyr (unngår å overraskende fjerne utstyr brukeren kan ha valgt manuelt).
- Async henting kjøres via supabase-klienten; feil logges men blokkerer ikke toggling.

Ingen DB-endringer.
