
# Ressursbokser fyller høyden vertikalt på /ressurser

## Nåværende problem

Alle tre kolonnene (droner, utstyr, personell) har hardkodet `max-h-[420px]` på sine scroll-containere. Det betyr at listene aldri kan bli høyere enn 420px, uavhengig av skjermstørrelse.

For å la boksene strekke seg til full tilgjengelig høyde må hele kjeden fra ytterkontaineren ned til listen ha riktige flex/height-egenskaper.

## Endringer som trengs

### Kjeden som må fikses

```text
div.min-h-screen (rot)
└── div.relative.z-10 (content wrapper)
    └── main                              ← trenger "flex flex-col" og "min-h-screen pt-[...]"
        └── div.grid.lg:grid-cols-3       ← trenger "flex-1" og "items-stretch"
            └── GlassCard (×3)            ← trenger "flex flex-col h-full"
                └── div.space-y-3        ← fjern max-h-[420px], legg til "flex-1 min-h-0 overflow-y-auto"
```

### 1. `src/pages/Resources.tsx` — ytre container

`main`-elementet må strekke seg til full høyde og sende den videre til grid:

```tsx
// Fra:
<main className="w-full px-3 sm:px-4 py-4 sm:py-6">
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">

// Til:
<main className="w-full px-3 sm:px-4 py-4 sm:py-6 flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 flex-1 lg:items-stretch">
```

`calc(100vh - 64px)` kompenserer for header-høyden slik at `main` fyller resten av skjermen.

### 2. `src/pages/Resources.tsx` — alle tre GlassCard

Hvert av de tre `GlassCard`-elementene (droner, utstyr, personell) trenger `flex flex-col h-full`:

```tsx
// Fra:
<GlassCard>

// Til:
<GlassCard className="flex flex-col h-full">
```

### 3. `src/pages/Resources.tsx` — de indre scroll-containerne

Alle tre `div`-elementene med `max-h-[420px] overflow-y-auto` erstattes med `flex-1 min-h-0 overflow-y-auto`:

```tsx
// Fra (×3):
<div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">

// Til:
<div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
```

`min-h-0` er nødvendig fordi flex-barn som standard ikke kan krympe under sitt naturlige innhold — `min-h-0` overstyrer dette og lar flex-barnet faktisk ta `flex-1` som høyde.

## Visuelt resultat

| Enhet | Før | Etter |
|---|---|---|
| Mobil | Kompakt (uendret) | Kompakt (uendret, stablet vertikalt) |
| Nettbrett / PC | Boksene er maks 420px høye | Boksene strekker seg til full skjermhøyde |
| Scroll | Starter etter 420px | Starter etter full tilgjengelig høyde |

## Filer som endres

| Fil | Endringer |
|---|---|
| `src/pages/Resources.tsx` | 1) `main` får `flex flex-col` og `minHeight: calc(100vh - 64px)` — 2) Grid får `flex-1 lg:items-stretch` — 3) Alle tre `GlassCard` får `flex flex-col h-full` — 4) Alle tre scroll-containere: fjern `max-h-[420px]`, legg til `flex-1 min-h-0` |
