## Problem
Når ruta tegnes, bygges FG (grønn) og Cont (gul) først som sylindre fra bakken (`render_base_m = 0`) opp til AGL-høyden. Det ser riktig ut. Etter ~200 ms kjører en terreng-enrichment som setter `render_base_m = terrain_max_m`, og sonene "løftes" da opp til den høyeste terrengtoppen innenfor polygonet. Det er det som gjør at de mister kontakt med bakken etter ca. 1 sekund.

## Endring (kun `src/components/Map3D.tsx`, i `rebuildRouteSources` → terrain-enrichment, rundt linje 1387–1408)

La sonene fortsatt starte ved bakken, men bruk terrengdata kun til å heve toppen slik at sonen dekker både laveste og høyeste terrengpunkt + AGL.

Konkret:
- Behold `render_base_m = 0` (ikke bytt til `terrain_max_m`).
- Sett `render_height_m = terrain_max_m + agl` (slik at toppen fortsatt strekker seg AGL over høyeste terrengpunkt). Fallback uendret når sampling mangler: `render_height_m = agl`.
- Behold lagring av `terrain_min_m` / `terrain_max_m` som properties (brukt andre steder / debug).

Effekt: fill-extrusion-volumene står fortsatt fra `0 m` MSL og opp, så de er visuelt forankret i bakken, samtidig som toppen er hevet nok til å representere AGL-taket over terrenget. Ingen endring i SORA-buffergeometri, FG-/Cont-/GRB-farger, ruteoverlay, markører eller andre lag.

## Teknisk detalj

```ts
// Erstatt blokken som i dag setter baseM = terrain_max:
let topM = f.agl;
if (ring) {
  props.terrain_min_m = ring.smoothedMin;
  props.terrain_max_m = ring.smoothedMax;
  topM = ring.smoothedMax + f.agl;
} else if (fb) {
  props.terrain_min_m = fb.min;
  props.terrain_max_m = fb.max;
  topM = fb.max + f.agl;
}
props.render_base_m = 0;
props.render_height_m = topM;
```

Ingen andre filer berøres.
