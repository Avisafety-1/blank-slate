
# Fiks: Scroll i dokumentlisten i oppdragsdialogen

## Rotårsak

Dokumentlisten i `AddMissionDialog` er bygget med `Popover` + `Command`/`CommandList`, ikke `Select`. Begge portales ut av dialog-DOM-treet via Radix sin popper-mekanisme, men de har ulike data-attributter:

- Radix Select: `[data-radix-select-content]` og `[role="listbox"]`
- Radix Popover: `[data-radix-popper-content-wrapper]` (wrapper-div) og `[data-radix-popover-content]` (innholds-div)

Eksisterende guard i `onPointerDownOutside` dekker allerede `[data-radix-popper-content-wrapper]`, så dialogen lukkes ikke ved klikk. Men **`onInteractOutside` mangler tilsvarende guard for Popover/popper-innhold** — den sjekker bare `[data-radix-select-content]` og `[role="listbox"]`. Dette betyr at scroll- og touch-events inne i `PopoverContent` trigger `onInteractOutside`, som kan forstyrre scrolling.

I tillegg bruker `CommandList` `overflow-y-auto` for scroll, men `onPointerDownOutside` som nå returnerer tidlig for `[data-radix-popper-content-wrapper]` fungerer som forventet. Problemet er utelukkende i `onInteractOutside`.

## Løsning

Én endring i `src/components/ui/dialog.tsx`:

Utvid `onInteractOutside`-guarden til også å inkludere Radix Popover sine portaling-attributter:

```typescript
onInteractOutside={(e) => {
  const target = e.target as HTMLElement | null;

  const hasOpenSelect = !!document.querySelector(
    '[data-radix-select-content][data-state="open"], [role="listbox"][data-state="open"]',
  );

  const activeDateInput = document.activeElement as HTMLInputElement | null;
  const isDateTimeInput =
    activeDateInput?.tagName === "INPUT" &&
    (activeDateInput.type === "datetime-local" ||
      activeDateInput.type === "date" ||
      activeDateInput.type === "time");

  if (
    hasOpenSelect ||
    isDateTimeInput ||
    target?.closest('[data-radix-select-content]') ||
    target?.closest('[role="listbox"]') ||
    target?.closest('[data-radix-popper-content-wrapper]') ||   // ← NY
    target?.closest('[data-radix-popover-content]')             // ← NY
  ) {
    e.preventDefault();
  }

  onInteractOutside?.(e);
}}
```

## Hva de nye linjene gjør

| Guard | Hva den dekker |
|---|---|
| `[data-radix-popper-content-wrapper]` | Ytre wrapper som Radix Popover portaler til `body` |
| `[data-radix-popover-content]` | Selve `PopoverContent`-elementet |

Disse to selektorene sikrer at alle interaksjoner (scroll, klikk, touch) inne i `PopoverContent` — inkludert `CommandList`-scrolling — ikke lenger trigger dialog-lukking via `onInteractOutside`.

## Hvorfor påvirker ikke dette "tilfeldig lukking"-beskyttelsen?

`onInteractOutside` har aldri vært den primære mekanismen som lukker dialogen ved klikk utenfor — det gjør `onPointerDownOutside`. Guard-logikken i `onInteractOutside` er utelukkende for å blokkere stale-events fra portaled UI, og er ikke involvert i den ordinære "klikk utenfor"-lukking. Endringen er dermed trygg.

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/ui/dialog.tsx` | Legg til to selektorer i `onInteractOutside`-guard |

Én liten endring med global effekt for alle dialoger som bruker `Popover` + `Command`/`CommandList` (dokument-, personell-, utstyr- og dronesøk i oppdragsdialogen).
