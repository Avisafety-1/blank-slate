
# Plan: Implementere sanntidsoppdateringer for dashboard og popups

## Bakgrunn
Når vedlikehold utføres eller data oppdateres i appen, reflekteres ikke endringene umiddelbart i dashboardet eller i popup-vinduer. Problemet skyldes at enkelte komponenter mangler sanntidssubskripsjoner til databasen.

## Identifiserte problemområder

### Kritisk - StatusPanel/Dashboard
- **useStatusData hook** bruker TanStack Query med 30 sekunders cache uten sanntidssubskripsjon
- Dashboard StatusPanel oppdateres ikke når vedlikehold utføres

### Moderat - List-dialoger på dashboard  
- **DroneListDialog**, **EquipmentListDialog** og **PersonnelListDialog** mottar data via props
- Når detalj-dialoger oppdaterer en entitet, reflekteres ikke dette i listen bak

### Mindre - Drone tilbehør
- Vedlikehold på drone-tilbehør oppdaterer ikke drone-status på dashboard

---

## Løsning

### Del 1: Legge til sanntidssubskripsjoner i useStatusData

Oppdatere `src/hooks/useStatusData.ts` for å lytte på endringer i:
- `drones` (INSERT, UPDATE, DELETE)
- `equipment` (INSERT, UPDATE, DELETE)  
- `profiles` (UPDATE)
- `personnel_competencies` (alle events)
- `drone_accessories` (alle events - påvirker drone-status)

Ved endring invalideres TanStack Query cache, som trigger automatisk re-fetch.

### Del 2: Synkronisere selectedDrone/Equipment i list-dialoger

Oppdatere dialogene til å synkronisere valgt element når underliggende data endres:

**DroneListDialog:**
- Legge til useEffect som oppdaterer `selectedDrone` når `drones` prop endres

**EquipmentListDialog:**
- Legge til useEffect som oppdaterer `selectedEquipment` når `equipment` prop endres

**PersonnelListDialog:**  
- Legge til useEffect som oppdaterer `selectedPerson` når `personnel` prop endres

---

## Tekniske detaljer

### useStatusData.ts - Endringer

Legge til sanntidssubskripsjoner med React Query cache-invalidering:

```typescript
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// Inne i useStatusData:
const queryClient = useQueryClient();

useEffect(() => {
  if (!user) return;

  const channel = supabase
    .channel('status-data-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drones' }, 
      () => queryClient.invalidateQueries({ queryKey: ['drones'] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, 
      () => queryClient.invalidateQueries({ queryKey: ['equipment'] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, 
      () => queryClient.invalidateQueries({ queryKey: ['personnel'] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel_competencies' }, 
      () => queryClient.invalidateQueries({ queryKey: ['personnel'] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_accessories' }, 
      () => queryClient.invalidateQueries({ queryKey: ['drones'] }))
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user, queryClient]);
```

### DroneListDialog.tsx - Endringer

```typescript
// Synkroniser selectedDrone når drones prop endres
useEffect(() => {
  if (selectedDrone && drones.length > 0) {
    const updated = drones.find(d => d.id === selectedDrone.id);
    if (updated) {
      setSelectedDrone(updated);
    }
  }
}, [drones]);
```

### EquipmentListDialog.tsx - Endringer

```typescript
useEffect(() => {
  if (selectedEquipment && equipment.length > 0) {
    const updated = equipment.find(e => e.id === selectedEquipment.id);
    if (updated) {
      setSelectedEquipment(updated);
    }
  }
}, [equipment]);
```

### PersonnelListDialog.tsx - Endringer

```typescript
useEffect(() => {
  if (selectedPerson && personnel.length > 0) {
    const updated = personnel.find(p => p.id === selectedPerson.id);
    if (updated) {
      setSelectedPerson(updated);
    }
  }
}, [personnel]);
```

---

## Filer som endres

1. `src/hooks/useStatusData.ts` - Legge til sanntidssubskripsjoner
2. `src/components/dashboard/DroneListDialog.tsx` - Synkronisere selectedDrone
3. `src/components/dashboard/EquipmentListDialog.tsx` - Synkronisere selectedEquipment  
4. `src/components/dashboard/PersonnelListDialog.tsx` - Synkronisere selectedPerson

---

## Forventet resultat

Etter implementering:
- Dashboard StatusPanel oppdateres umiddelbart ved vedlikehold/endringer
- Droner/utstyr/personell-lister oppdateres i sanntid
- Åpne popup-vinduer reflekterer endringer gjort fra andre komponenter
- Ingen manuell refresh nødvendig for å se oppdaterte data
