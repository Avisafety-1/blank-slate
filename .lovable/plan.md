
# Rotårsak og fix: Scroll i CommandList inne i Popover/Dialog

## Den faktiske rotårsaken

Etter å ha lest gjennom hele `cmdk`-biblioteket, `dialog.tsx`, `popover.tsx` og `AddMissionDialog.tsx` er rotårsaken nå klar:

`CommandList` stopper ikke wheel-events fra å propagere opp i DOM-treet. Når brukeren scroller i lista, bobler wheel-eventen opp fra:

```
CommandList → PopoverContent (portal i body) → body
```

Radix setter `overflow: hidden` (og noen ganger `pointer-events: none`) på `body` mens en Dialog er åpen — dette er standard oppførsel for å hindre bakgrunnscrolling under modaler. Wheel-events som treffer `body` blir dermed ikke stoppet og fordi `body` ikke kan scrolle, "forsvinner" de og `CommandList` scroller aldri.

Løsningen er å stoppe wheel-event-propagasjonen direkte på `CommandList`-elementet, slik at scroll-eventen aldri når `body`.

## Løsningen: `onWheel` stopper propagasjon i CommandList

I `src/components/ui/command.tsx` legger vi til en `onWheel`-handler på `CommandList` som stopper propagasjonen hvis lista faktisk kan scrolle (dvs. innholdet er høyere enn synlig område):

```typescript
const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop === 0 && e.deltaY < 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;
    if (!atTop && !atBottom) {
      e.stopPropagation();
    }
  };

  return (
    <CommandPrimitive.List
      ref={composeRefs(listRef, ref)}
      className={cn(
        "max-h-[min(300px,var(--radix-popper-available-height,300px))] overflow-y-auto overflow-x-hidden",
        className
      )}
      onWheel={handleWheel}
      {...props}
    />
  );
});
```

Logikken er:
- Hvis lista er scrollet til toppen og brukeren scroller opp → la eventen propagere (naturlig oppførsel)
- Hvis lista er scrollet til bunnen og brukeren scroller ned → la eventen propagere (naturlig oppførsel)
- Ellers (lista KAN scrolle) → stopp propagasjonen med `e.stopPropagation()`

Dette betyr at scroll inne i lista alltid fungerer, og scroll som "ville ha gått ut av lista" propagerer normalt.

## Behov for `composeRefs`

`CommandList` bruker nå to refs: en intern (`listRef`) og den videresendte (`ref`). Vi bruker `@radix-ui/react-compose-refs` som allerede er tilgjengelig som en transitiv avhengighet via `cmdk`. Alternativt kan vi bruke en enkel callback ref-sammensetning direkte i React uten ekstra import.

For å unngå ny avhengighet bruker vi en enkel hjelpefunksjon:

```typescript
function composeRefs<T>(...refs: React.Ref<T>[]) {
  return (node: T) => {
    refs.forEach(ref => {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<T>).current = node;
    });
  };
}
```

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/ui/command.tsx` | Legg til `onWheel`-handler i `CommandList` som stopper scroll-propagasjon |

## Hva endres i brukeropplevelsen

| Situasjon | Før | Etter |
|---|---|---|
| Scroll i dokumentlisten | Wheel-event propagerer til body og blokkeres av Radix | Stopper i CommandList, lista scroller normalt |
| Lista er i topp/bunn | Propagerer (normal oppførsel) | Propagerer (uendret) |
| Touch-scroll på mobil | Samme problem | Fungerer (touch-events er separate fra wheel) |
| Alle andre Popover+Command-lister | Samme problem | Fikset globalt for hele appen |

## Hvorfor ingen andre endringer trengs

- `dialog.tsx`: Ingen endring — de eksisterende fixene der er korrekte
- `popover.tsx`: `overflow-hidden` er allerede på plass
- `AddMissionDialog.tsx`: Ingen endring — `setOpenDocumentPopover(false)` etter valg er ønsket oppførsel (brukeren vil at dialogen lukkes etter valg)
