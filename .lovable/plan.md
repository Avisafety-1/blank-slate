

## Utfør oppdragssjekklister direkte fra Start Flight Dialog

### Problem
Når et oppdrag har tilknyttede sjekklister som ikke er fullført, vises bare en advarsel som sier at de må utføres fra oppdragskortet. Brukeren må lukke dialogen, gå til oppdragskortet, fullføre sjekklistene, og deretter starte flytur på nytt.

### Løsning
Erstatt advarselen med en interaktiv sjekkliste-liste (samme mønster som company-level sjekklister ovenfor), der brukeren kan åpne og fullføre hver sjekkliste direkte. Bruk eksisterende `ChecklistExecutionDialog` som allerede er importert.

### Endringer

**`src/components/StartFlightDialog.tsx`**

**1. Legg til state for mission checklist execution**
- `activeMissionChecklistId` — hvilken oppdragssjekkliste som kjøres nå
- `missionChecklistTitles` — titler for oppdragssjekklistene

**2. Fetch sjekkliste-titler når mission velges**
- Utvid eksisterende `fetchChecklistState` (linje 212-231) til også å hente titler fra `documents`-tabellen for `checklist_ids`

**3. Erstatt advarsel (linje 826-833) med interaktiv liste**
- Vis hver sjekkliste med tittel + status (fullført/ikke fullført)
- «Utfør»-knapp som åpner `ChecklistExecutionDialog`
- Grønn hake for allerede fullførte

**4. Håndter fullføring**
- `handleMissionChecklistComplete` som lagrer til DB (`checklist_completed_ids`) og oppdaterer lokal state
- Oppdater `validateMissionChecklists` slik at den bruker lokal `missionCompletedChecklistIds` state (som allerede oppdateres)

**5. Legg til ChecklistExecutionDialog for mission checklists**
- Ny instans av `ChecklistExecutionDialog` med `activeChecklistId={activeMissionChecklistId}`
- Ved fullføring: oppdater `mission.checklist_completed_ids` i DB og lokal state

### Kode-skisse

```typescript
// Ny state
const [activeMissionChecklistId, setActiveMissionChecklistId] = useState<string | null>(null);
const [missionChecklistTitles, setMissionChecklistTitles] = useState<Record<string, string>>({});

// I fetchChecklistState — etter eksisterende fetch, legg til:
if (checklistIds.length > 0) {
  const { data: docs } = await supabase
    .from('documents').select('id, tittel').in('id', checklistIds);
  const titles: Record<string,string> = {};
  docs?.forEach(d => { titles[d.id] = d.tittel; });
  setMissionChecklistTitles(titles);
}

// Erstatt advarsel-blokken med:
{missionChecklistIds.length > 0 && (
  <div className="space-y-2 mt-2">
    {missionChecklistIds.map(id => {
      const done = missionCompletedChecklistIds.includes(id);
      return (
        <div key={id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <span className="text-sm truncate">{missionChecklistTitles[id] || '…'}</span>
          {done ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" /> Fullført
            </span>
          ) : (
            <Button variant="outline" size="sm" 
              onClick={() => setActiveMissionChecklistId(id)}>
              Utfør
            </Button>
          )}
        </div>
      );
    })}
  </div>
)}

// Ny ChecklistExecutionDialog for mission checklists
<ChecklistExecutionDialog
  open={!!activeMissionChecklistId}
  onOpenChange={(o) => { if (!o) setActiveMissionChecklistId(null); }}
  checklistId={activeMissionChecklistId || ''}
  itemName={missionChecklistTitles[activeMissionChecklistId || ''] || ''}
  onComplete={handleMissionChecklistCompleteFromDialog}
/>

// Handler:
const handleMissionChecklistCompleteFromDialog = async (checklistId: string) => {
  if (!selectedMissionId) return;
  const newCompleted = [...missionCompletedChecklistIds, checklistId];
  await supabase.from('missions').update({ checklist_completed_ids: newCompleted }).eq('id', selectedMissionId);
  setMissionCompletedChecklistIds(newCompleted);
};
```

Ingen databaseendringer. Ingen nye avhengigheter.

