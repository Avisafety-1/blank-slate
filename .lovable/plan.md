
# Fix: Dagsdialogen lukkes ikke etter vedlikehold i kalenderen

## Problemet

I `src/pages/Kalender.tsx`, linje 544, kaller `performMaintenanceUpdate` alltid `setDialogOpen(false)` etter at vedlikeholdet er fullført. Dette lukker dagsdialogen umiddelbart, selv om det er flere vedlikeholdselementer på samme dag.

```typescript
// Linje 544 — dette er problemet:
setDialogOpen(false);
fetchCustomEvents();
```

Brukeren vil at dialogen forblir åpen slik at de kan huke av for alle vedlikeholdsoppgaver på én og samme dag.

## Løsningen

### 1. Fjern `setDialogOpen(false)` fra `performMaintenanceUpdate`

Den enkleste og mest korrekte løsningen er å fjerne `setDialogOpen(false)` fra `performMaintenanceUpdate`. Dialogen skal kun lukkes manuelt av brukeren.

```typescript
// Etter:
toast.success('Vedlikehold registrert som utført');
// (ingen setDialogOpen(false) her)
fetchCustomEvents();
```

### 2. Oppdater vedlikeholdsknapper visuelt etter fullføring

Siden `fetchCustomEvents()` henter ferske data og re-renderer listen, vil vedlikeholdselementer som er utført (og dermed har fått ny `neste_vedlikehold`-dato) forsvinne fra listen for den valgte dagen automatisk. Dette er riktig oppførsel — listen oppdateres selv, og brukeren kan se at vedlikeholdet ble registrert via toast-meldingen.

### Hva skjer med checklist-flyten?

`handleChecklistComplete` kaller `performMaintenanceUpdate` som igjen ikke lenger lukker dagsdialogen. Men vi må også sørge for at checklistdialogen lukkes etter fullføring (dette gjøres allerede av `ChecklistExecutionDialog` internt via `onOpenChange(false)` — det er OK).

### Endringer

| Fil | Linje | Endring |
|---|---|---|
| `src/pages/Kalender.tsx` | ~544 | Fjern `setDialogOpen(false)` fra `performMaintenanceUpdate` |

Det er én linje som fjernes. Ingen andre endringer er nødvendig — `fetchCustomEvents()` oppdaterer allerede listen dynamisk, og elementer som er fullført forsvinner fra listen for den aktuelle dagen.
