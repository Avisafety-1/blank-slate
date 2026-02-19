
# Fiks: Scroll i mission-liste fungerer ikke i StartFlightDialog

## Rotårsaken

Det er to sammenkoblede problemer:

**Problem 1 — `onPointerDownOutside` blokkerer Select-scroll:**
Fiksen vi nettopp implementerte i `dialog.tsx` legger til `onPointerDownOutside={(e) => e.preventDefault()}` globalt. Radix Select portaler `SelectContent` ut av dialog-DOM-treet og plasserer det i `document.body`. Når brukeren prøver å scrolle i listen via touch/mus, sender Radix Select en `pointerdown`-event som dialog-komponenten oppfatter som "utenfor dialogen" og kaller `e.preventDefault()` — dette blokkerer Radix sin interne scroll-mekanisme (`ScrollUpButton`/`ScrollDownButton`) og touch-scrolling.

**Problem 2 — SelectViewport høyde i "popper"-modus:**
I `select.tsx` er `SelectViewport` satt til `h-[var(--radix-select-trigger-height)]` i popper-modus, som begrenser listen til å være like høy som knappen (ca. 40px). Den burde ikke ha noen fast høydebegrensning i viewport for å tillate fri scrolling opp til `max-h-96` på Content-elementet.

## Løsninger

### Fix 1 — `dialog.tsx`: Ikke blokker pointer-events for portaled Select

`onPointerDownOutside` bør sjekke om `pointerdown`-eventet stammer fra et Radix Select-innhold eller annet portaled UI, og kun da la det passere:

```typescript
onPointerDownOutside={(e) => {
  const target = e.target as HTMLElement | null;
  
  // Ikke blokker pointer-events for Radix Select-innhold
  // (portalet ut av dialog-DOM og bruker pointer-events for scroll)
  if (
    target?.closest('[data-radix-select-content]') ||
    target?.closest('[role="listbox"]') ||
    target?.closest('[data-radix-popper-content-wrapper]')
  ) {
    return; // La Radix Select håndtere dette selv
  }
  
  // Blokker ellers utilsiktet lukking
  e.preventDefault();
}}
```

### Fix 2 — `select.tsx`: Fjern høydebegrensning på Viewport i popper-modus

Endre `SelectViewport` i `select.tsx` fra:
```typescript
position === "popper" &&
  "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
```
til:
```typescript
position === "popper" &&
  "w-full min-w-[var(--radix-select-trigger-width)]"
```

Dette lar `SelectContent` sin `max-h-96` begrense høyden, og Radix sin interne scroll-mekanisme (ScrollUpButton/ScrollDownButton) tar seg av scrollingen.

## Hva endres

| Situasjon | Før | Etter |
|---|---|---|
| Scroll i mission-liste (StartFlightDialog) | Ikke mulig | Fungerer normalt |
| Scroll i alle andre Select-lister inne i dialoger | Ikke mulig | Fungerer normalt |
| Utilsiktet lukking av dialog ved klikk utenfor | Dialog lukkes | Dialog forblir åpen (beholdes) |
| Klikk på Select-innhold | Blokkert av dialog | Passerer gjennom normalt |

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/ui/dialog.tsx` | Legg til guard i `onPointerDownOutside` for portaled Select-innhold |
| `src/components/ui/select.tsx` | Fjern `h-[var(--radix-select-trigger-height)]` fra Viewport i popper-modus |

To enkle endringer — global effekt for alle Select-lister inne i dialoger.
