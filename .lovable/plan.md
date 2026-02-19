
# Sjekkliste tilknyttet oppdrag («Tilknytt sjekkliste»)

## Oversikt

Brukeren vil kunne knytte sjekklister direkte til et oppdrag (ikke til en bedrift globalt), slik at:
1. En sjekkliste velges fra «Flere valg»-menyen på oppdragskortet
2. En badge vises på oppdragskortet: grå «Utfør sjekkliste» → grønn «Sjekkliste utført» etter fullføring
3. StartFlightDialog blokkerer flystart hvis sjekkliste er tilknyttet men ikke utført, med en tydelig feilmelding

## Datamodell

`missions`-tabellen har ikke et sjekkliste-felt enda. Vi legger til:
- `checklist_ids uuid[]` — liste over tilknyttede sjekklistId-er
- `checklist_completed_ids uuid[]` — liste over fullførte sjekklisteId-er (persistert per oppdrag)

En ny migrering legger til begge kolonner med default `'{}'::uuid[]`.

## Filer som endres

| Fil | Hva |
|---|---|
| `supabase/migrations/[ny].sql` | Legg til `checklist_ids` og `checklist_completed_ids` på `missions` |
| `src/pages/Oppdrag.tsx` | Dropdown-valg + badge + sjekkliste-dialog |
| `src/components/StartFlightDialog.tsx` | Blokkering + ny dialog ved forsøk på flystart med utestående sjekkliste |

## Detaljert implementasjon

### 1. Database-migrering

```sql
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS checklist_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS checklist_completed_ids uuid[] NOT NULL DEFAULT '{}';
```

### 2. `src/pages/Oppdrag.tsx`

#### 2a. Ny state

```tsx
const [checklistMission, setChecklistMission] = useState<Mission | null>(null);
const [checklistPickerOpen, setChecklistPickerOpen] = useState(false);
const [executingChecklistId, setExecutingChecklistId] = useState<string | null>(null);
const [executingChecklistMissionId, setExecutingChecklistMissionId] = useState<string | null>(null);
```

#### 2b. «Tilknytt sjekkliste» i dropdown-menyen

Etter «Ny risikovurdering»-valget, legg til:

```tsx
<DropdownMenuItem onClick={() => {
  setChecklistMission(mission);
  setChecklistPickerOpen(true);
}}>
  <ClipboardCheck className="h-4 w-4 mr-2" />
  Tilknytt sjekkliste
</DropdownMenuItem>
```

#### 2c. Sjekkliste-badge på oppdragskortet

Direkte under de eksisterende badge-ene (SORA, AI-risk), vis en badge dersom `mission.checklist_ids?.length > 0`:

```tsx
{mission.checklist_ids?.length > 0 && (
  <Badge
    variant="outline"
    className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
      mission.checklist_ids.every((id: string) =>
        mission.checklist_completed_ids?.includes(id)
      )
        ? 'bg-green-500/20 text-green-900 border-green-500/30'
        : 'bg-gray-500/20 text-gray-700 border-gray-500/30'
    }`}
    onClick={(e) => {
      e.stopPropagation();
      // Åpne første ufullstendige sjekkliste
      const nextId = mission.checklist_ids.find(
        (id: string) => !mission.checklist_completed_ids?.includes(id)
      ) || mission.checklist_ids[0];
      setExecutingChecklistId(nextId);
      setExecutingChecklistMissionId(mission.id);
    }}
  >
    <ClipboardCheck className="h-3 w-3 mr-1" />
    {mission.checklist_ids.every((id: string) =>
      mission.checklist_completed_ids?.includes(id)
    )
      ? 'Sjekkliste utført'
      : 'Utfør sjekkliste/r'}
  </Badge>
)}
```

#### 2d. Dialog for å velge sjekkliste («ChecklistPickerDialog»)

En ny enkel dialog (inline i Oppdrag.tsx) som viser alle tilgjengelige sjekklister. Bruker eksisterende `useChecklists`-hook. Når bruker velger en sjekkliste:
- Lagre `checklist_ids` på mission: `supabase.from('missions').update({ checklist_ids: [...existing, id] })`
- Oppdater lokal state / kall `fetchMissions()`

Dialogen viser også hvilke sjekklister som allerede er tilknyttet, med mulighet til å fjerne dem.

#### 2e. ChecklistExecutionDialog for oppdrag

Når badgen klikkes (state `executingChecklistId` er satt), åpnes den eksisterende `ChecklistExecutionDialog`.

`onComplete`-handler:
```tsx
const handleMissionChecklistComplete = async () => {
  if (!executingChecklistId || !executingChecklistMissionId) return;
  const mission = missions.find(m => m.id === executingChecklistMissionId);
  const existing = mission?.checklist_completed_ids || [];
  if (!existing.includes(executingChecklistId)) {
    await supabase.from('missions').update({
      checklist_completed_ids: [...existing, executingChecklistId]
    }).eq('id', executingChecklistMissionId);
  }
  fetchMissions();
};
```

### 3. `src/components/StartFlightDialog.tsx` — blokkering

Når bruker velger et oppdrag i StartFlightDialog, sjekkes om det har uutførte sjekklister:

```tsx
// Fetch mission checklist state when mission is selected
useEffect(() => {
  if (!selectedMissionId || selectedMissionId === 'none') {
    setMissionChecklistIds([]);
    setMissionCompletedChecklistIds([]);
    return;
  }
  const fetchChecklistState = async () => {
    const { data } = await supabase
      .from('missions')
      .select('checklist_ids, checklist_completed_ids')
      .eq('id', selectedMissionId)
      .single();
    if (data) {
      setMissionChecklistIds(data.checklist_ids || []);
      setMissionCompletedChecklistIds(data.checklist_completed_ids || []);
    }
  };
  fetchChecklistState();
}, [selectedMissionId]);
```

I `handleStartFlightClick`:
```tsx
const hasMissionIncompleteChecklists = missionChecklistIds.some(
  id => !missionCompletedChecklistIds.includes(id)
);
if (hasMissionIncompleteChecklists) {
  setShowMissionChecklistWarning(true);
  return;
}
```

Ny AlertDialog vises:
```
«Utfør sjekkliste fra oppdragskortet»
Dette oppdraget har en sjekkliste som må utføres fra oppdragskortet 
(/oppdrag) før du kan starte en flytur.
[Avbryt]
```

## Brukerflyt

```text
Oppdragskort → Flere valg → Tilknytt sjekkliste
  → Dialog: velg sjekkliste fra liste
  → Sjekkliste tilknyttet

Oppdragskort viser nå grå badge «Utfør sjekkliste/r»
  → Klikk badge → ChecklistExecutionDialog åpnes
  → Kryss av alle punkter → Fullfør
  → Badge blir grønn: «Sjekkliste utført»

StartFlightDialog → Velg oppdrag med sjekkliste som ikke er utført
  → Klikk «Start flytur»
  → Dialog: «Utfør sjekkliste fra oppdragskortet»
  → Flystart blokkeres
```

## Viktige detaljer

- `checklist_completed_ids` persisteres i databasen slik at status beholdes mellom sesjoner og enheter
- Dersom et oppdrag har flere sjekklister, åpner badgeklikk den første ufullstendige
- Sjekklisten kan fjernes fra oppdraget via samme «Tilknytt sjekkliste»-dialog (toggle-funksjon)
- Alle eksisterende sjekkliste-funksjoner (bedriftsnivå i StartFlightDialog) er upåvirket
- `fetchMissionsForTab` allerede henter alle kolonner (`select('*')`), så de nye kolonnene plukkes opp automatisk

## Filer som opprettes/endres

| Fil | Handling |
|---|---|
| `supabase/migrations/[ny].sql` | Opprett — legger til `checklist_ids` og `checklist_completed_ids` på `missions` |
| `src/pages/Oppdrag.tsx` | Endre — dropdown-valg, badge, picker-dialog, execution-dialog |
| `src/components/StartFlightDialog.tsx` | Endre — sjekk oppdragets sjekkliste-status, ny blokkerings-dialog |
