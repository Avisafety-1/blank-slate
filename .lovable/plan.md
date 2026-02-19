
# Fiks: Rotårsak til at scroll ikke fungerer i dokumentlisten

## Den faktiske rotårsaken

Problemet er i `onInteractOutside`-guarden i `dialog.tsx`. CSS-selektoren som sjekker om portaled innhold er åpent:

```typescript
const hasOpenPortaledContent = !!document.querySelector(
  '[data-radix-popper-content-wrapper] [data-state="open"], [data-radix-popper-content-wrapper]',
);
```

Den andre delen av selektoren — `'[data-radix-popper-content-wrapper]'` — matcher **alltid** et element i DOM, fordi Radix monterer popper-wrappers i `body` og holder dem der selv når de er lukket. Dette betyr at `hasOpenPortaledContent` alltid er `true`, og `e.preventDefault()` kalles på **hvert eneste** `onInteractOutside`-event — inkludert scroll-events inne i `CommandList`.

Radix sender `onInteractOutside` ikke bare ved klikk utenfor, men også ved visse scroll- og touch-events. Når `e.preventDefault()` alltid kjøres, blokkeres disse events fra å nå `CommandList`'s scroll-mekanisme.

## Løsning

Fiks selektoren så den bare matcher åpne popper-wrappere:

```typescript
// Fra (matcher alltid):
'[data-radix-popper-content-wrapper] [data-state="open"], [data-radix-popper-content-wrapper]'

// Til (matcher kun åpne):
'[data-radix-popper-content-wrapper] [data-state="open"]'
```

Den fulle `onInteractOutside` etter endringen:

```typescript
onInteractOutside={(e) => {
  const originalTarget = (e.detail as any)?.originalEvent?.target as HTMLElement | null;
  const target = (e.target as HTMLElement | null) ?? originalTarget;

  // Sjekk om noe portaled Radix-innhold er ÅPENT (ikke bare montert)
  const hasOpenPortaledContent = !!document.querySelector(
    '[data-radix-popper-content-wrapper] [data-state="open"]',  // ← Fjernet ", [data-radix-popper-content-wrapper]"
  );

  const activeDateInput = document.activeElement as HTMLInputElement | null;
  const isDateTimeInput =
    activeDateInput?.tagName === "INPUT" &&
    (activeDateInput.type === "datetime-local" ||
      activeDateInput.type === "date" ||
      activeDateInput.type === "time");

  const isInsidePopper = !!(
    target?.closest('[data-radix-popper-content-wrapper]') ||
    originalTarget?.closest('[data-radix-popper-content-wrapper]')
  );

  if (hasOpenPortaledContent || isDateTimeInput || isInsidePopper) {
    e.preventDefault();
  }

  onInteractOutside?.(e);
}}
```

## Hvorfor dette er trygt

- Dialog lukkes fortsatt ikke ved klikk utenfor (det håndteres av `onPointerDownOutside`, ikke `onInteractOutside`)
- iPad-datepicker-beskyttelsen (`isDateTimeInput`) er intakt
- Klikk inne i åpne popovere/selecter blokkerer fortsatt dialog-lukking (`isInsidePopper` og `hasOpenPortaledContent` når en faktisk er åpen)
- `onInteractOutside` er en sekundær hendelse — den primære lukkemekanismen er `onPointerDownOutside`

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/ui/dialog.tsx` | Fjern `, [data-radix-popper-content-wrapper]` fra querySelector-selektoren |

En én-linje endring som løser det underliggende problemet som har vært rotårsaken hele veien.
