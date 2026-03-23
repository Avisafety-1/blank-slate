

## Plan: Fiks ForceReloadBanner safe-area på iPhone PWA

### Problem
Banneret bruker `fixed top-0` og havner under iOS statusbar (batteri, signal). Knappene blir uklikkbare.

### Løsning
Legg til `padding-top: env(safe-area-inset-top)` på banneret, samme mønster som allerede brukes i Dialog og ExpandedMapDialog.

### Endring — `src/components/ForceReloadBanner.tsx`
Endre div-klassen til å inkludere `pt-[env(safe-area-inset-top)]` via inline style (Tailwind støtter ikke `env()` direkte):

```tsx
<div 
  className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-primary-foreground px-4 py-3 flex items-center justify-center gap-3 shadow-lg"
  style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 0.75rem)` }}
>
```

Dette skyver innholdet ned under statusbaren på iPhones med notch/dynamic island, mens det forblir uendret på enheter uten safe-area.

### Filer
- `src/components/ForceReloadBanner.tsx`

