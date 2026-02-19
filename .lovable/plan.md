
# Faner i sjekkliste-dialog for oppdrag

## Problemet

Når et oppdrag har flere tilknyttede sjekklister, åpnes kun én sjekkliste om gangen via `executingChecklistId`. Det finnes ingen måte å navigere til de andre sjekklistene uten å lukke dialogen og klikke badgen på nytt. Brukeren vil ha faner øverst i dialogen slik at man kan bytte mellom sjekklistene direkte.

## Løsning

Modifisere `ChecklistExecutionDialog` til å støtte et array av sjekkliste-ID-er (`checklistIds: string[]`) i tillegg til en liste over allerede utførte ID-er (`completedIds: string[]`). En fane vises per sjekkliste, med et grønt hakemerke-ikon på faner som er fullstendig utført. Nedre del av dialogen viser innholdet i den valgte fanens sjekkliste.

Kallet fra `Oppdrag.tsx` endres til å sende alle sjekkliste-ID-ene for oppdraget, slik at alle er tilgjengelige via faner i én og samme dialog.

## Detaljert implementasjon

### 1. `src/components/resources/ChecklistExecutionDialog.tsx`

#### Ny props-interface

```ts
interface ChecklistExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistIds: string[];           // Array — alle sjekkliste-ID-er
  completedIds?: string[];          // Allerede fullførte
  itemName: string;
  onComplete: (checklistId: string) => void | Promise<void>;
  // Bakoverkompatibilitet: gammel enkelt-ID-prop beholdes som alias
  checklistId?: string;
}
```

#### Ny intern state

- `activeChecklistId: string` — den aktive fanen
- `checklistTitles: Record<string, string>` — tittel per sjekkliste-ID (for fanelabels)
- `items: ChecklistItem[]` — punkter i den valgte sjekklisten (endres når fane byttes)
- `checkedItems: Set<string>` — per fane, lagres i `checkedByTab: Record<string, Set<string>>`

Når bruker bytter fane:
- `activeChecklistId` settes til ny ID
- `items` hentes for den nye sjekklisten
- `checkedItems` hentes fra `checkedByTab[newId]` (bevares mellom fanebytt)

#### Fane-header

Mellom `DialogHeader` og fremdriftslinjen, vis en `TabsList` med én `TabsTrigger` per sjekkliste. Bruker Radix Tabs (allerede importert i prosjektet):

```tsx
{checklistIds.length > 1 && (
  <Tabs value={activeChecklistId} onValueChange={handleTabChange}>
    <TabsList className="w-full">
      {checklistIds.map((id) => (
        <TabsTrigger key={id} value={id} className="flex-1 gap-1.5 text-xs">
          {completedChecklistIds.has(id) && (
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          )}
          {checklistTitles[id] || '...'}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
)}
```

#### Fremdriftslinje

Viser fremgang for den aktive fanen (slik som i dag).

#### Fullfør-knapp

`onComplete(activeChecklistId)` kalles i stedet for `onComplete()`. Etter fullføring:
- Hopper automatisk til neste ufullstendige fane (hvis noen)
- Hvis alle faner er fullstendige — lukker dialogen

#### Bakoverkompatibilitet

Eksisterende bruk av `ChecklistExecutionDialog` (utstyr, drone-vedlikehold) sender fortsatt `checklistId` (enkelt streng). Wrapping:
```ts
const ids = props.checklistIds ?? (props.checklistId ? [props.checklistId] : []);
```
Dermed trengs ingen endringer i de andre stedene som bruker komponenten.

### 2. `src/pages/Oppdrag.tsx`

#### State-endring

Fjern `executingChecklistId` (enkelt-ID). Behold `executingChecklistMissionId`. Legg til:
```ts
const [executingChecklistMissionId, setExecutingChecklistMissionId] = useState<string | null>(null);
```

Badge-klikk trenger ikke lenger velge én spesifikk ID — den åpner dialogen med **alle** sjekklister for oppdraget:
```tsx
onClick={(e) => {
  e.stopPropagation();
  setExecutingChecklistMissionId(mission.id);
}}
```

#### Ny `onComplete`-handler

```tsx
const handleMissionChecklistComplete = async (checklistId: string) => {
  if (!executingChecklistMissionId) return;
  const mission = [...activeMissions, ...completedMissions]
    .find(m => m.id === executingChecklistMissionId);
  const existing: string[] = mission?.checklist_completed_ids || [];
  if (!existing.includes(checklistId)) {
    await supabase.from('missions').update({
      checklist_completed_ids: [...existing, checklistId]
    }).eq('id', executingChecklistMissionId);
  }
  fetchMissions();
};
```

#### Oppdatert dialog-kall

```tsx
{executingChecklistMissionId && (() => {
  const mission = [...activeMissions, ...completedMissions]
    .find(m => m.id === executingChecklistMissionId);
  return (
    <ChecklistExecutionDialog
      open={!!executingChecklistMissionId}
      onOpenChange={(open) => {
        if (!open) setExecutingChecklistMissionId(null);
      }}
      checklistIds={mission?.checklist_ids || []}
      completedIds={mission?.checklist_completed_ids || []}
      itemName={mission?.tittel || ''}
      onComplete={handleMissionChecklistComplete}
    />
  );
})()}
```

## Brukerflyt

```
Badge «Utfør sjekkliste/r» klikkes
  → Dialog åpnes med faner øverst (én fane per tilknyttet sjekkliste)
  → Første ufullstendige sjekkliste er aktiv fane
  → Bruker krysser av punkter → klikker «Fullfør»
    → Fane får grønt hakemerke-ikon
    → Dialog hopper automatisk til neste ufullstendige fane
  → Alle faner fullstendig → dialog lukkes
  → Badge endres til grønn «Sjekkliste utført»
```

Dersom det kun er én sjekkliste tilknyttet oppdraget, vises ingen fane-header — dialogen ser identisk ut med dagens dialog.

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/resources/ChecklistExecutionDialog.tsx` | Refaktoreres til å støtte faner med flere sjekklister |
| `src/pages/Oppdrag.tsx` | Badge-klikk og dialog-kall oppdateres til multi-sjekkliste |
