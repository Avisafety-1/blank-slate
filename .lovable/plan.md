
# Fiks: Scroll i dokumentlisten i AddMissionDialog

## Rotårsak — faktisk kilde til problemet

Etter grundig analyse er problemet **ikke** lenger i `dialog.tsx`. De tidligere fiksen der er riktige. Rotårsaken er i **`PopoverContent`** (`src/components/ui/popover.tsx`) kombinert med at `cmdk`-bibliotekets `CommandList` begrenses av `--radix-popper-available-height`.

Radix Popover setter CSS-variabelen `--radix-popper-available-height` på popper-wrapper-elementet, som representerer tilgjengelig piksel-høyde over eller under trigger-knappen. `CommandList` i cmdk-biblioteket bruker `max-h-[300px]`, men dette er et absolutt tak — den bruker ikke `--radix-popper-available-height`. Det betyr:

- Hvis det er lite plass under knappen (f.eks. knappen er nær bunnen av dialogen), klipper Radix selve `PopoverContent`-elementet fordi det ikke har `overflow: hidden` eller noen relasjon til tilgjengelig høyde
- `CommandList`-scrollbaren rendres visuelt, men `touch`/`wheel`-events som starter utenfor det scrollbare elementet sendes opp i DOM-treet og "spises" av popover-wrapperen

## To konkrete fikser

### Fix 1 — `popover.tsx`: Legg til `overflow-hidden` på `PopoverContent`

`PopoverContent` mangler `overflow-hidden`, som gjør at innhold som strekker seg lengre enn popoveren kan dukke opp utenfor den avrundede rammen, og at scroll-events ikke er korrekt "containet". Legg til `overflow-hidden` i default className:

```typescript
// Fra:
"z-[1250] w-72 rounded-md border bg-popover p-4 ..."

// Til:
"z-[1250] w-72 overflow-hidden rounded-md border bg-popover p-4 ..."
```

### Fix 2 — `command.tsx`: La `CommandList` respektere tilgjengelig høyde

`CommandList` bruker `max-h-[300px]` som et absolutt tak. Men inne i en Popover bør den heller bruke Radix sin `--radix-popper-available-height` CSS-variabel for å tilpasse seg dynamisk til tilgjengelig plass. Legg til en ekstra `max-h`-verdi som respekterer Radix:

```typescript
// Fra:
"max-h-[300px] overflow-y-auto overflow-x-hidden"

// Til:
"max-h-[min(300px,var(--radix-popper-available-height,300px))] overflow-y-auto overflow-x-hidden"
```

Dette gjør at lista aldri blir høyere enn hva Radix har beregnet som tilgjengelig plass, og scrollbaren er alltid synlig og funksjonell.

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/ui/popover.tsx` | Legg til `overflow-hidden` i `PopoverContent` sin default className |
| `src/components/ui/command.tsx` | Oppdater `CommandList` sin `max-h` til å bruke `--radix-popper-available-height` |

## Hva endres i brukeropplevelsen

| Situasjon | Før | Etter |
|---|---|---|
| Scroll i dokumentlisten | Ikke mulig | Fungerer normalt |
| Lista klipper innhold utenfor popoveren | Skjer når plass er begrenset | Forhindres med overflow-hidden |
| Lista tilpasser seg tilgjengelig plass | Fast 300px uansett | Dynamisk tilpasning til skjermposisjon |
| Alle andre Popover+Command-lister i appen | Samme problem potensielt | Fikset globalt |
