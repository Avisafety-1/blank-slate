
# Fix: Ressursbokser vokser ikke lenger med innholdet

## Problemet

`main`-elementet har `minHeight: calc(100vh - 64px)` — dette setter en minimumshøyde, men lar elementet vokse ubegrenset når innholdet er mer enn skjermen. Grid og kort vokser da tilsvarende, noe som betyr at `lg:flex-1 lg:min-h-0` på scroll-containerne ikke fungerer som forventet — fordi foreldreelementet ikke har en fast høyde å forholde seg til.

For at `flex-1 min-h-0` skal begrense scroll-containerne til skjermhøyden, må hele kjeden fra `main` ned ha **fast høyde** (ikke bare min-høyde).

## Løsningen

### 1. `main` — bruk `height` i stedet for `minHeight`

```tsx
// Fra:
style={{ minHeight: 'calc(100vh - 64px)' }}

// Til:
style={{ height: 'calc(100vh - 64px)' }}
```

Med en fast høyde på `main` kan `flex-1` på grid-elementet fylle nøyaktig den gjenværende plassen — ikke mer.

### 2. Grid — legg tilbake `flex-1` uten `lg:`-prefix

Grid-elementet trenger `flex-1` (uten `lg:`-prefix) for at det skal vokse til å fylle `main` sin faste høyde:

```tsx
// Fra:
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 lg:flex-1 lg:items-stretch">

// Til:
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 lg:flex-1 lg:items-stretch lg:overflow-hidden">
```

Legg til `lg:overflow-hidden` på grid-elementet for å hindre at det vokser utover `main`.

### 3. GlassCard — legg til `lg:overflow-hidden`

Hver `GlassCard` med `lg:flex lg:flex-col lg:h-full` trenger også `lg:overflow-hidden` slik at kortet ikke vokser utover sin tildelte høyde:

```tsx
// Fra:
<GlassCard className="lg:flex lg:flex-col lg:h-full">

// Til:
<GlassCard className="lg:flex lg:flex-col lg:h-full lg:overflow-hidden">
```

Dette er den manglende lenken — uten `overflow-hidden` kan kortet vokse utenfor grid-cellens høyde, og `flex-1 min-h-0` på scroll-containeren har ingen effekt.

## Oppsummering av endringer

| Fil | Element | Fra | Til |
|---|---|---|---|
| `src/pages/Resources.tsx` | `<main>` style | `minHeight: 'calc(100vh - 64px)'` | `height: 'calc(100vh - 64px)'` |
| `src/pages/Resources.tsx` | Grid-div | `lg:items-stretch` | `lg:items-stretch lg:overflow-hidden` |
| `src/pages/Resources.tsx` | Drones GlassCard | `lg:flex lg:flex-col lg:h-full` | `lg:flex lg:flex-col lg:h-full lg:overflow-hidden` |
| `src/pages/Resources.tsx` | Equipment GlassCard | `lg:flex lg:flex-col lg:h-full` | `lg:flex lg:flex-col lg:h-full lg:overflow-hidden` |
| `src/pages/Resources.tsx` | Personnel GlassCard | `lg:flex lg:flex-col lg:h-full` | `lg:flex lg:flex-col lg:h-full lg:overflow-hidden` |

## Visuelt resultat

| Enhet | Før | Etter |
|---|---|---|
| Mobil | Boksene vokste med innhold | Maks 420px per boks, intern scroll |
| PC/Nettbrett (lg+) | Boksene vokste med innhold utover skjermen | Boksene er låst til skjermhøyden, intern scroll |

Kun `src/pages/Resources.tsx` endres.
