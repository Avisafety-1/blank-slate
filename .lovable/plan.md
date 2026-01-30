
# Plan: Ressurskonfliktdeteksjon for oppdrag ✅ IMPLEMENTERT

## Oversikt
Implementert et system for å oppdage og varsle om konflikter når samme ressurs (drone, utstyr eller personell) er tildelt flere oppdrag som overlapper i tid. Dette vises både i oppdragslisten og når man legger til/redigerer et oppdrag.

## Hovedfunksjoner ✅

### 1. Konfliktdeteksjon i AddMissionDialog ✅
Når bruker velger drone, utstyr eller personell:
- Sjekke om ressursen allerede er tildelt et annet oppdrag som overlapper i tid
- Vise en advarsel/info-melding under den aktuelle ressurslinjen
- Tillate brukeren å fortsette (ikke blokkere), men tydelig informere om konflikten

### 2. Konfliktindikasjon i Oppdrag-listen (Oppdrag.tsx)
For hvert oppdrag som vises:
- Under hver ressurs (drone, utstyr, personell) vises en liten info/advarsel hvis ressursen er i konflikt med et annet oppdrag
- Viser hvilket oppdrag konflikten er med og tidspunktet

### 3. Nærhet-i-tid varsler
I tillegg til direkte konflikter (overlappende tid):
- Vis en "info" hvis samme ressurs brukes samme dag (men ikke overlappende)
- Hjelper operatører med å planlegge logistikk bedre

---

## Teknisk implementering

### Ny hook: useResourceConflicts

```typescript
// src/hooks/useResourceConflicts.ts
export interface ResourceConflict {
  resourceId: string;
  resourceType: 'drone' | 'equipment' | 'personnel';
  resourceName: string;
  conflictType: 'overlap' | 'same_day';
  conflictingMission: {
    id: string;
    tittel: string;
    tidspunkt: string;
    slutt_tidspunkt?: string;
  };
}

export const useResourceConflicts = (
  missionId: string | undefined,
  missionTime: string,
  missionEndTime?: string,
  selectedDrones: string[],
  selectedEquipment: string[],
  selectedPersonnel: string[]
) => {
  // Fetches all active missions with their resources
  // Compares against selected resources
  // Returns conflicts for each resource type
};
```

### Konfliktsjekk-logikk

```typescript
const checkTimeOverlap = (
  mission1Start: Date, 
  mission1End: Date | null,
  mission2Start: Date, 
  mission2End: Date | null
): 'overlap' | 'same_day' | null => {
  // Default duration: 2 timer hvis slutt_tidspunkt mangler
  const defaultDuration = 2 * 60 * 60 * 1000; 
  
  const m1Start = mission1Start;
  const m1End = mission1End || new Date(m1Start.getTime() + defaultDuration);
  const m2Start = mission2Start;
  const m2End = mission2End || new Date(m2Start.getTime() + defaultDuration);
  
  // Sjekk overlapp
  if (m1Start < m2End && m1End > m2Start) {
    return 'overlap';
  }
  
  // Sjekk samme dag
  if (isSameDay(m1Start, m2Start)) {
    return 'same_day';
  }
  
  return null;
};
```

### UI-komponent: ResourceConflictWarning

```typescript
// src/components/dashboard/ResourceConflictWarning.tsx
interface ResourceConflictWarningProps {
  conflicts: ResourceConflict[];
  resourceType: 'drone' | 'equipment' | 'personnel';
}

export const ResourceConflictWarning = ({ conflicts, resourceType }: Props) => {
  if (conflicts.length === 0) return null;
  
  const overlaps = conflicts.filter(c => c.conflictType === 'overlap');
  const sameDay = conflicts.filter(c => c.conflictType === 'same_day');
  
  return (
    <div className="space-y-1 mt-1">
      {overlaps.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Konflikt: {overlaps[0].resourceName} er allerede tildelt "{overlaps[0].conflictingMission.tittel}" 
            ({format(new Date(overlaps[0].conflictingMission.tidspunkt), "dd.MM HH:mm")})
          </span>
        </div>
      )}
      {sameDay.length > 0 && overlaps.length === 0 && (
        <div className="flex items-start gap-1.5 text-xs text-blue-600 dark:text-blue-400">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {sameDay[0].resourceName} brukes også i "{sameDay[0].conflictingMission.tittel}" samme dag
          </span>
        </div>
      )}
    </div>
  );
};
```

### Endringer i AddMissionDialog

```typescript
// I AddMissionDialog.tsx - etter ressurs-valg seksjoner:

// Ny state for konflikter
const [resourceConflicts, setResourceConflicts] = useState<ResourceConflict[]>([]);

// Kall hook/funksjon for å sjekke konflikter når tidspunkt eller ressurser endres
useEffect(() => {
  if (formData.tidspunkt) {
    checkResourceConflicts();
  }
}, [formData.tidspunkt, selectedDrones, selectedEquipment, selectedPersonnel]);

// Under drone-listen:
{selectedDrones.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-2">
    {selectedDrones.map((id) => {
      const drone = drones.find((d) => d.id === id);
      const conflicts = resourceConflicts.filter(
        c => c.resourceId === id && c.resourceType === 'drone'
      );
      return (
        <div key={id}>
          <div className="flex items-center gap-1 bg-secondary ...">
            <span>{drone?.modell}</span>
            {conflicts.length > 0 && (
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            )}
            <button onClick={() => removeDrone(id)}>
              <X className="h-3 w-3" />
            </button>
          </div>
          <ResourceConflictWarning 
            conflicts={conflicts} 
            resourceType="drone" 
          />
        </div>
      );
    })}
  </div>
)}
```

### Endringer i Oppdrag.tsx (ressurs-grid)

```typescript
// I ressurs-grid seksjonen, under hver ressurs:

{/* Drones */}
<div>
  <div className="flex items-center gap-2 mb-2">
    <Plane className="h-4 w-4 text-muted-foreground" />
    <p className="text-xs font-semibold text-muted-foreground">DRONER</p>
  </div>
  {mission.drones?.length > 0 ? (
    <ul className="space-y-1">
      {mission.drones.map((d: any) => {
        const droneConflicts = getResourceConflicts(
          mission.id, 
          mission.tidspunkt, 
          mission.slutt_tidspunkt,
          d.drone_id, 
          'drone',
          allMissions
        );
        return (
          <li key={d.drone_id} className="space-y-0.5">
            <span className="text-sm text-foreground flex items-center gap-1">
              {d.drones?.modell} (SN: {d.drones?.serienummer})
              {droneConflicts.length > 0 && (
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              )}
            </span>
            {droneConflicts.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 pl-0">
                ⚠️ Brukes også i "{droneConflicts[0].conflictingMission.tittel}"
              </p>
            )}
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
  )}
</div>
```

---

## Dataflyt

```text
+------------------+     +---------------------+     +------------------+
|  User selects    | --> | Check conflicts     | --> | Display warnings |
|  resource + time |     | against all active  |     | inline with      |
|                  |     | missions            |     | resources        |
+------------------+     +---------------------+     +------------------+
                                  |
                                  v
                    +---------------------------+
                    | Query: missions with      |
                    | personnel/drones/equipment|
                    | that overlap in time      |
                    +---------------------------+
```

---

## Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| `src/hooks/useResourceConflicts.ts` | **Ny fil** - Hook for konfliktsjekking |
| `src/components/dashboard/ResourceConflictWarning.tsx` | **Ny fil** - UI-komponent for varsler |
| `src/components/dashboard/AddMissionDialog.tsx` | Legge til konfliktsjekking og varsler under ressurs-valg |
| `src/pages/Oppdrag.tsx` | Legge til konflikt-indikatorer i ressurs-grid |

---

## Brukeropplevelse

### I AddMissionDialog (når man oppretter/redigerer):
- Når man velger en ressurs som allerede er booket:
  - **Overlappende tid**: Gul/oransje advarsel med ⚠️-ikon
  - **Samme dag**: Blå info med ℹ️-ikon
- Varselet viser navn på ressurs og hvilket oppdrag den er i konflikt med

### I oppdragslisten:
- Ressurser med konflikter vises med et lite ⚠️-ikon
- Under ressursnavnet vises en kort tekst: "Brukes også i [oppdragsnavn]"

---

## Eksempel på visning

**I AddMissionDialog:**
```
Droner
[DJI Mavic 3 ⚠️] [x]
  ⚠️ Konflikt: Brukes i "Inspeksjon kraftledning" (15. feb 10:00)

Personell  
[Ola Nordmann] [x]
[Kari Hansen ℹ️] [x]
  ℹ️ Kari Hansen er også tildelt "Kursing" samme dag
```

**I Oppdrag.tsx:**
```
DRONER
DJI Mavic 3 (SN: ABC123) ⚠️
  ⚠️ Brukes også i "Kursing av droneflygere"
```
