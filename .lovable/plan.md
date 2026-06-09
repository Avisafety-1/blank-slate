## Mål
Gjøre ribbon-en jevnere og mindre "trappete" ved å justere tetthet, bredde, overlapp og opacity i `rebuildRouteRibbon` i `src/components/Map3D.tsx`. Beholder eksisterende stiplet `rp-route-line`.

## Endringer (kun `src/components/Map3D.tsx`)

### `rebuildRouteRibbon`
- `SEGMENT_M`: 40 → **12** (mål: 10–15 m).
- `MAX_SAMPLES`: 250 → **600**.
- `WIDTH_M`: 3 → **1.8**.
- Innfør `OVERLAP_M = 1.5`. For hvert segment forleng `p1` bakover med `-OVERLAP_M/2` og `p2` fremover med `+OVERLAP_M/2` langs (dx, dy)-retningen før perpendikulær-offset beregnes. På endene clampes ikke — overlapp utenfor rutens endepunkter er kosmetisk akseptabelt (≈0.75 m).

### `addRoutePlanningLayers`
- `RP_LAYER_ROUTE_RIBBON` `fill-extrusion-opacity`: 0.7 → **0.5**.

### Ikke endre
- `rp-route-line` beholdes uendret (stiplet bakkenær referanselinje).
- `RouteData`, lagring, SORA-lag, andre opacity-verdier — uendret.

## Verifikasjon
Vise rute på 2+ km terreng-variert område, sjekk at ribbon ser jevn ut og at hver "trapp" ikke har synlige glipper.
