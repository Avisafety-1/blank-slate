## Mål
På `/status` → "Avvik"-fanen, i tabellen "Detaljer" nederst:
1. Klikk på en avviksrad åpner oppdraget i samme popup som brukes fra dashbordet (`MissionDetailDialog`), i stedet for å navigere bort til `/oppdrag?id=…`.
2. Legge til en knapp "Opprett hendelse" på hver avviksrad. Den åpner `AddIncidentDialog` med oppdraget forhåndsvalgt (samme dialog som brukes fra dashbordet, der oppdragsvalg auto-fyller pilot/drone/utstyr).

## Endringer (én fil)
**`src/pages/Status.tsx`**

1. Import:
   - `MissionDetailDialog` fra `@/components/dashboard/MissionDetailDialog`
   - `AddIncidentDialog` fra `@/components/dashboard/AddIncidentDialog`
   - Et ikon, f.eks. `AlertCircle` fra `lucide-react`

2. Ny state:
   ```ts
   const [missionDialogOpen, setMissionDialogOpen] = useState(false);
   const [selectedMission, setSelectedMission] = useState<any>(null);
   const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
   const [incidentMissionId, setIncidentMissionId] = useState<string | null>(null);
   ```

3. Hjelper for å åpne mission-popup: når brukeren klikker en rad med `mission_id`, hent oppdraget fra `missions` (samme select-felt som `MissionsSection` bruker for sin `mission`-prop), sett `selectedMission` og åpne dialogen. Hvis henting feiler/ingen mission_id, ikke gjør noe.

4. Tabellrad (linje 2184–2199):
   - Legge til en ny `<TableHead>` "Handlinger" i headeren.
   - I raden: endre `onClick` til å kalle den nye åpne-popup-funksjonen i stedet for `navigate(...)`.
   - Ny `<TableCell>` med en knapp `Opprett hendelse` (variant `outline`, size `sm`, med `AlertCircle`-ikon). `onClick` stopper propagering og setter `incidentMissionId = r.mission_id` + åpner `AddIncidentDialog`. Knappen er disabled hvis `!r.mission_id`.

5. Etter `</GlassCard>`-listen i deviation-view, render:
   ```tsx
   <MissionDetailDialog
     open={missionDialogOpen}
     onOpenChange={setMissionDialogOpen}
     mission={selectedMission}
     onMissionUpdated={fetchDeviationStatistics}
   />
   <AddIncidentDialog
     open={incidentDialogOpen}
     onOpenChange={setIncidentDialogOpen}
     defaultMissionId={incidentMissionId ?? undefined}
   />
   ```

## Ikke berørt
- Ingen endringer i `MissionDetailDialog`, `AddIncidentDialog` eller i database/RLS — `AddIncidentDialog` har allerede `defaultMissionId`-prop som auto-fyller pilot/drone/utstyr fra valgt oppdrag.
- Operational-fanen og resten av Status.tsx forblir uendret.

## Verifisering
- Åpne `/status` → toggle "Avvik" → klikk en rad med oppdrag → MissionDetailDialog åpnes.
- Klikk "Opprett hendelse" på en rad → AddIncidentDialog åpnes med oppdrag valgt og pilot/drone/utstyr forhåndsutfylt.
- Rader uten `mission_id` har deaktivert knapp og åpner ikke popup.
