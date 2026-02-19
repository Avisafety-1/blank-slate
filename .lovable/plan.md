
# Fix: Musehjul og touch-scroll i CommandList

## Rotårsak (nå bekreftet)

Det er to separate problemer som begge må fikses:

### Problem 1: `onWheel` — `stopPropagation` alene er ikke nok

`e.stopPropagation()` hindrer eventen i å boble opp, men Radix UI blokkerer scroll på en annen måte: det setter `overflow: hidden` direkte på `body` via inline style. Wheel-events som treffer elementer inne i en portal (Popover er portaled til `body`) trenger ikke bare `stopPropagation` — de trenger `preventDefault` for å hindre at nettleseren videresender scroll til `body`.

Løsningen er å endre `handleWheel` til å kalle `e.preventDefault()` i tillegg til `e.stopPropagation()`, og deretter manuelt scrolle listen selv:

```typescript
const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
  const el = listRef.current;
  if (!el) return;
  
  const { scrollTop, scrollHeight, clientHeight } = el;
  const isScrollable = scrollHeight > clientHeight;
  
  if (!isScrollable) return;
  
  const atTop = scrollTop === 0 && e.deltaY < 0;
  const atBottom = Math.abs(scrollTop + clientHeight - scrollHeight) < 1 && e.deltaY > 0;
  
  if (!atTop && !atBottom) {
    e.preventDefault();
    e.stopPropagation();
    el.scrollTop += e.deltaY;
  }
};
```

`el.scrollTop += e.deltaY` scroller listen manuelt, siden `preventDefault()` hindrer nettleserens native scroll.

For at `preventDefault()` skal fungere på wheel-events, må event listeneren registreres som **non-passive**. React legger til wheel-handlers som passive som standard i nyere versjoner, noe som betyr at `preventDefault()` ignoreres. Løsningen er å bruke `useEffect` med `addEventListener` og `{ passive: false }`:

```typescript
useEffect(() => {
  const el = listRef.current;
  if (!el) return;
  
  const handler = (e: WheelEvent) => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const isScrollable = scrollHeight > clientHeight;
    if (!isScrollable) return;
    const atTop = scrollTop === 0 && e.deltaY < 0;
    const atBottom = Math.abs(scrollTop + clientHeight - scrollHeight) < 1 && e.deltaY > 0;
    if (!atTop && !atBottom) {
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += e.deltaY;
    }
  };
  
  el.addEventListener('wheel', handler, { passive: false });
  return () => el.removeEventListener('wheel', handler);
}, []);
```

### Problem 2: Touch-scroll fungerer ikke

Touch-scroll krever:
1. CSS `touch-action: pan-y` på listen — dette forteller nettleseren at vertikal touch-scroll skal tillates
2. En `onTouchMove`-handler som kaller `e.stopPropagation()` for å hindre at touch-events propagerer til dialog/body-laget

```typescript
const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
  e.stopPropagation();
};
```

Og i className legges `[touch-action:pan-y]` til:

```typescript
className={cn(
  "max-h-[min(300px,var(--radix-popper-available-height,300px))] overflow-y-auto overflow-x-hidden [touch-action:pan-y]",
  className
)}
```

## Komplett løsning for `CommandList`

```typescript
const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    
    const handler = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const isScrollable = scrollHeight > clientHeight;
      if (!isScrollable) return;
      const atTop = scrollTop === 0 && e.deltaY < 0;
      const atBottom = Math.abs(scrollTop + clientHeight - scrollHeight) < 1 && e.deltaY > 0;
      if (!atTop && !atBottom) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollTop += e.deltaY;
      }
    };
    
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <CommandPrimitive.List
      ref={composeRefs(listRef, ref)}
      className={cn(
        "max-h-[min(300px,var(--radix-popper-available-height,300px))] overflow-y-auto overflow-x-hidden [touch-action:pan-y]",
        className
      )}
      onTouchMove={(e) => e.stopPropagation()}
      {...props}
    />
  );
});
```

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/ui/command.tsx` | Erstatt `onWheel`-handler med `useEffect`-basert native event listener (passive: false), legg til `touch-action: pan-y` og `onTouchMove` stopper |

## Hvorfor denne løsningen er riktig

| Problem | Tidligere forsøk | Nå |
|---|---|---|
| Musehjul | `e.stopPropagation()` via React `onWheel` — men React registrerer passive handlers, `preventDefault()` ignoreres | Native `addEventListener` med `{ passive: false }` + manuell scroll |
| Touch | Ingen håndtering | `touch-action: pan-y` + `onTouchMove` stopper propagasjon |
| Synlig scrollbar men ikke scroll | Scroll DOM-noden selv med `el.scrollTop += e.deltaY` | Direkte scrollmanipulasjon |
