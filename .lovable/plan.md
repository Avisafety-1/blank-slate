
# Mobil: behold maks-høyde på ressursboksene

## Problemet

De tre scroll-containerne fikk `flex-1 min-h-0` uten mobil-unntak, noe som fjernet den gamle `max-h-[420px]`-begrensningen på alle skjermstørrelser. På mobil (stablet vertikalt) ønsker brukeren å beholde den kompakte maks-høyden.

## Løsningen — responsive klasser

I stedet for å velge én av delene, brukes Tailwind sin responsive prefix-syntaks til å kombinere begge:

```
max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto
```

- `max-h-[420px]` — aktiv på alle skjermstørrelser som startpunkt
- `lg:max-h-none` — fjerner maks-høyden fra lg og oppover
- `lg:flex-1 lg:min-h-0` — lar containeren fylle tilgjengelig plass kun på lg+

Det samme prinsippet gjelder for GlassCard og grid — de responsive klassene begrenses til `lg:`:

### GlassCard (alle tre):

```tsx
// Fra:
<GlassCard className="flex flex-col h-full">

// Til:
<GlassCard className="lg:flex lg:flex-col lg:h-full">
```

### Grid-div:

```tsx
// Fra:
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 flex-1 lg:items-stretch">

// Til:
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 lg:flex-1 lg:items-stretch">
```

`flex-1` på grid-elementet er kun relevant når `main` er en flex-container og innholdet er på én rad (lg+).

## Oppsummering av endringer

| Fil | Linje | Fra | Til |
|---|---|---|---|
| `src/pages/Resources.tsx` | 259 | `flex-1 lg:items-stretch` på grid | `lg:flex-1 lg:items-stretch` |
| `src/pages/Resources.tsx` | 263 | `GlassCard className="flex flex-col h-full"` | `GlassCard className="lg:flex lg:flex-col lg:h-full"` |
| `src/pages/Resources.tsx` | 311 | `flex-1 min-h-0 overflow-y-auto` | `max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto` |
| `src/pages/Resources.tsx` | 373 | samme som over | samme som over |
| `src/pages/Resources.tsx` | 431 | samme som over | samme som over |
| `src/pages/Resources.tsx` | 530 | samme som over (personell GlassCard) | `lg:flex lg:flex-col lg:h-full` |
| `src/pages/Resources.tsx` | 586 | `flex-1 min-h-0 overflow-y-auto` | `max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto` |

## Visuelt resultat

| Enhet | Før (etter forrige fix) | Etter |
|---|---|---|
| Mobil | Ingen maks-høyde, uendelig scrollbar | Maks 420px per boks, scrollbar inne i boksen |
| Nettbrett (lg) | Full høyde ✓ | Full høyde ✓ |
| PC (lg+) | Full høyde ✓ | Full høyde ✓ |

Kun `src/pages/Resources.tsx` endres.
