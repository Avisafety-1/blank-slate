## Problem

I `Map3D` blir SORA-bufferne i ruteplanlegger renderet feil:
- Alle tre lag (Flight Geography grønn, Contingency gul, Ground Risk rød) bruker samme høyde-uttrykk: base = `terrain_min_m`, topp = `terrain_max_m + flightAltitude`.
- Fordi `terrain_min_m` er det laveste punktet i polygonet, vil høyere terreng inni polygonet stikke opp og skjule den grønne/gule sonen — derfor "forsvinner" de.
- Lagene reflekterer ikke høyde-semantikken fra SORA-diagrammet (FG opp til flyhøyde, Contingency lavere, GRB kun bakkenivå).

## Mål (i henhold til vedlagt SORA-diagram)

- **Flight Geography (grønn)**: ekstrudert sylinder fra terrengoverflate opp til `terrain_max_m + flightAltitude`.
- **Contingency area (gul)**: ekstrudert sylinder fra terrengoverflate opp til `terrain_max_m + 0.5 × flightAltitude`.
- **Ground Risk Buffer (rød)**: drapert flatt på bakken (ingen ekstrusjon — kun en "skygge" på terrenget).
- Ingen sone skal kunne bli skjult av terrengtopper.

## Endringer

Kun `src/components/Map3D.tsx` (alt i ruteplanlegger-blokken — ingen ny logikk i `Kart.tsx`, `soraGeometry.ts` eller andre filer).

### 1. Lagdefinisjoner

- Behold `RP_LAYER_FG_FILL` og `RP_LAYER_CONT_FILL` som `fill-extrusion`.
- Bytt `RP_LAYER_GRB_FILL` fra `fill-extrusion` → `fill` (draperes automatisk på terreng av MapLibre når terrain er aktivt). Beholder `#ef4444` med `fill-opacity ≈ 0.2` og en svak `fill-outline-color`.
- Bruk lag-spesifikke paint-uttrykk som leser nye feature-properties `render_base_m` og `render_height_m` (i stedet for én delt baseExpr/heightExpr).

```
FG:   base = ["coalesce", ["get","render_base_m"], 0]
      height = ["coalesce", ["get","render_height_m"], 120]
Cont: base = ["coalesce", ["get","render_base_m"], 0]
      height = ["coalesce", ["get","render_height_m"], 60]
GRB:  (fill — ingen høyde)
```

Lag-rekkefølge nedenfra: terrain/bygninger/zone-extrusion → `rp-sora-grb-fill` (flat) → `rp-sora-cont-fill` → `rp-sora-fg-fill` → `rp-route-line` → DOM-markører.

### 2. Beregning av høyder per lag

I `rebuildRouteSources` (etter `buildSoraZoneGeoJSON`):

- Initialt (før terreng-sample er klart):
  - FG:   `render_base_m = 0`, `render_height_m = sora.flightAltitude`
  - Cont: `render_base_m = 0`, `render_height_m = 0.5 × sora.flightAltitude`
  - GRB:  ingen høyde-props (fill-lag)
- Etter `sampleZonesTerrain`:
  - FG:   `render_base_m = terrain_max_m`, `render_height_m = terrain_max_m + sora.flightAltitude`
  - Cont: `render_base_m = terrain_max_m`, `render_height_m = terrain_max_m + 0.5 × sora.flightAltitude`
  - GRB:  beholder kun `terrain_min_m`/`terrain_max_m` for evt. fremtidig bruk

Bruk `terrain_max_m` (ikke `terrain_min_m`) som base, slik at FG/Cont-sylinderen alltid ligger over alle terrengtopper innenfor polygonet. Dette løser "ligger under terrenget"-problemet.

Eksisterende debounce (200 ms) og betingelsen "bygg kun når `routePoints.length >= 2`" beholdes.

### 3. Opacity/farger

- FG: `#22c55e`, `fill-extrusion-opacity 0.25`
- Cont: `#eab308`, `fill-extrusion-opacity 0.25`
- GRB: `#ef4444`, `fill-opacity 0.2`, `fill-outline-color #ef4444`

(Samme palett som 2D-kartet for kontinuitet.)

### 4. Cleanup

`removeRoutePlanningLayers` oppdateres til å fjerne både `fill-extrusion`- og `fill`-typen GRB-laget. Style-swap-handler (`styledata`) re-registrerer lagene uendret.

## Det dette ikke endrer

- `soraGeometry.ts` (polygon-bygging) — uendret.
- `Kart.tsx` / `handleRouteChange` / `handleSaveRoute` — uendret; RouteData-format identisk med 2D.
- 2D-rendering (`OpenAIPMap`) — uendret.
- SSB-celler, VLOS-ring, pilot-markør, distanselabel — fortsatt utenfor scope (planlagt for senere leveranser).
