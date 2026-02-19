
# Fiks: Dialog lukkes ikke utilsiktet ved klikk utenfor

## Problemet

Alle dialoger i appen (sjekklisteopprettelse, oppdragsdialog, loggbok, osv.) bruker `DialogContent` fra `src/components/ui/dialog.tsx`. Radix UI sin standard oppførsel er å lukke dialogen ved ethvert klikk utenfor dens DOM-tre — inkludert:

- Klikk på native OS-datovelger (iPad)
- Utilsiktet treff på overlay ved scrolling på touch-enheter
- Klikk på elementer som er portaled ut (andre Radix-komponenter)

Den eksisterende koden har allerede en guard for Radix Select, men ingen generell beskyttelse mot vanlig "fat finger"-lukking.

## Løsning — én linje i `dialog.tsx`

Den enkleste og mest robuste løsningen er å legge til `onPointerDownOutside={(e) => e.preventDefault()}` som en **standard prop på `DialogContent`**. Dette blokkerer all utilsiktet lukking via klikk utenfor, men beholder X-knappen og `Escape`-tasten som gyldige lukkeveier.

I tillegg legges det til den manglende dato/tid-input-guarden fra den tidligere planlagte iPad-tidsvelger-fiksen.

### Oppdatert `onInteractOutside` + ny `onPointerDownOutside`

```typescript
// I DialogContent (src/components/ui/dialog.tsx)

onPointerDownOutside={(e) => {
  // Blokker lukking ved klikk/tap utenfor dialogen som standard.
  // Brukere kan fortsatt lukke via X-knapp eller Escape.
  e.preventDefault();
}}
onInteractOutside={(e) => {
  const target = e.target as HTMLElement | null;

  // Eksisterende: Radix Select åpen
  const hasOpenSelect = !!document.querySelector(
    '[data-radix-select-content][data-state="open"], [role="listbox"][data-state="open"]',
  );

  // Nytt: Native dato/tid-input aktiv (iPad tidsvelger-problem)
  const activeDateInput = document.activeElement as HTMLInputElement | null;
  const isDateTimeInput =
    activeDateInput?.tagName === 'INPUT' &&
    (activeDateInput.type === 'datetime-local' ||
     activeDateInput.type === 'date' ||
     activeDateInput.type === 'time');

  if (
    hasOpenSelect ||
    isDateTimeInput ||
    target?.closest('[data-radix-select-content]') ||
    target?.closest('[role="listbox"]')
  ) {
    e.preventDefault();
  }

  onInteractOutside?.(e);
}}
```

## Hva endres i brukeropplevelsen

| Situasjon | Før | Etter |
|---|---|---|
| Klikker tilfeldig utenfor dialog | Dialog lukkes, arbeid mistes | Dialog forblir åpen |
| iPad tidsvelger | Dialog lukkes | Dialog forblir åpen |
| Klikker X-knappen | Dialog lukkes | Dialog lukkes (uendret) |
| Trykker Escape | Dialog lukkes | Dialog lukkes (uendret) |
| Radix Select åpen + klikk utenfor | Dialog lukkes (feil) | Dialog forblir åpen (allerede fikset) |

## Berørte dialoger (alle fikses automatisk)

Alle komponenter som bruker `DialogContent` fra `@/components/ui/dialog`:
- `CreateChecklistDialog` (sjekkliste-opprettelse)
- `AddMissionDialog` (ny oppdrag + iPad tidsvelger)
- `DroneLogbookDialog`, `EquipmentLogbookDialog`, `FlightLogbookDialog`
- `AddIncidentDialog`, `RiskAssessmentDialog`, `SoraAnalysisDialog`
- Alle øvrige dialoger i appen

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/ui/dialog.tsx` | Legg til `onPointerDownOutside` + dato/tid-guard i `onInteractOutside` |

Én fil, én endring — global effekt for hele appen.
