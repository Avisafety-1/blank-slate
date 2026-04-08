

## Operasjonssjekkliste på dronekortet med auto-kobling til oppdrag

### Oversikt
Legg til et nytt felt `operations_checklist_id` på droner. Denne sjekklisten knyttes automatisk til oppdrag når dronen legges til, og må utføres som del av oppdraget — akkurat som dagens dokumentbaserte sjekklister.

### Database-migrasjon
Legg til kolonne på `drones`-tabellen:
```sql
ALTER TABLE public.drones
  ADD COLUMN operations_checklist_id UUID REFERENCES public.documents(id);
```

### Endringer

**`src/components/resources/DroneDetailDialog.tsx`**
- Legg til `operations_checklist_id` i Drone-interfacet, formData, og populering fra DB
- I visningsmodus: vis valgt operasjonssjekkliste (label + navn)
- I redigeringsmodus: ny Select-dropdown «Operasjonssjekkliste» med checklists fra `useChecklists`
- Lagre feltet ved oppdatering

**`src/components/resources/AddDroneDialog.tsx`**
- Legg til ny Select-dropdown «Operasjonssjekkliste» (separat fra inspeksjonssjekklisten)
- Lagre `operations_checklist_id` ved opprettelse

**`src/components/dashboard/AddMissionDialog.tsx`**
- Etter at droner er koblet til oppdrag (både INSERT og UPDATE), hent `operations_checklist_id` fra de valgte dronene
- Merge disse sjekkliste-ID-ene inn i oppdragets `checklist_ids` (deduplisert)
- Ved fjerning av drone fra oppdrag, fjern tilhørende operations_checklist_id fra checklist_ids (med mindre andre droner har samme)

### Filer som endres
1. **Ny migrasjon** — `operations_checklist_id` kolonne
2. **`src/components/resources/DroneDetailDialog.tsx`** — vis/rediger feltet
3. **`src/components/resources/AddDroneDialog.tsx`** — velg ved opprettelse
4. **`src/components/dashboard/AddMissionDialog.tsx`** — auto-sync til oppdrag

