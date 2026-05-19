## Mål

Etterligne droneflykart.no: når musa hovrer over et polygon/geosone på kartet, løftes det laget midlertidig til toppen slik at klikk treffer riktig sone (typisk når flere soner overlapper). I tillegg en liten visuell hover-effekt på selve polygonet.

Dagens faste z-indeks-hierarki beholdes uendret som baseline — vi legger kun til en midlertidig promotion under hover.

## Slik fungerer det

1. **Pane-promotion ved hover** — Når musa går inn på et feature i et hover-aktivert pane (f.eks. `nsmPane`, `aipPane`, `rmzPane`, `rpasPane`, `notamPane`, `airportPane`, `populationDensityPane`, naturvern-/CAA-/DK-soner), settes pane sin `z-index` midlertidig til en høy verdi (f.eks. `760`, like under `safeskyPane` 750 men over alt annet polygon-innhold). Ved `mouseout` restaureres opprinnelig verdi.
2. **Visuell hover-effekt på polygonet** — Det hovrede feature får økt `fillOpacity` (+0.15), tykkere `weight` (+1), og lett lysere stroke. Restaureres på `mouseout`. Bruker `setStyle()` på Leaflet-layeret.
3. **Klikk treffer riktig** — Fordi pane-z løftes på hover, vil Leaflet sin hit-test sende klikket til det øverste (hovrede) laget — samme oppførsel som droneflykart.no.

## Implementasjon

### Ny hjelpefunksjon: `src/lib/mapHoverPromotion.ts`

Eksporterer to verktøy:

- `attachHoverPromotion(layer, { paneName, originalZ, hoverZ, hoverStyle })` — fester `mouseover`/`mouseout`/`remove` handlere på et enkelt Leaflet-feature-layer. På `mouseover`: sett pane z-index = `hoverZ`, lagre original style, kall `setStyle(hoverStyle)`. På `mouseout`: gjenopprett.
- `promotePaneOnHover(map, paneName, hoverZ)` — leser opprinnelig z-indeks fra `map.getPane(paneName).style.zIndex`, returnerer `{ enter, leave }` callbacks som setter/restaurerer.

Robusthet: counter på antall aktive hover-er per pane, slik at raske mouseover/out på naboshapes innenfor samme pane ikke flikker pane'en ned før neste enter.

### Bruke i fetchers (`src/lib/mapDataFetchers.ts`)

I `onEachFeature`-callbacks i `L.geoJSON({...})` for:
- `fetchCaaDroneZones` (caaFlyplasserLayer m.fl.)
- `fetchNaturvernZones`
- `fetchVernRestrictionZones`
- `fetchDkDroneZones`, `fetchDkNatureAreas`
- NSM, RPAS, CTR (kalt fra OpenAIPMap)
- AIP-soner

…legges til:
```ts
attachHoverPromotion(layer, {
  paneName: '<pane>',
  hoverZ: 760,
  hoverStyle: { weight: weight + 1, fillOpacity: Math.min(fillOpacity + 0.15, 0.6) },
});
```

### Bruke i `OpenAIPMap.tsx`

For NSM/RPAS/CTR/AIP og lignende geosoner som lages direkte der: samme `attachHoverPromotion`-kall i `onEachFeature`. Faste z-indeksverdier i `paneConfig` røres ikke.

### Eksklusjoner

- Live-trafikk (SafeSky-fly, drone-markører, AIS), oppdragsmarkører, kraftledninger og NOTAM-pins får ikke hover-promotion (de er allerede øverst eller skal ikke "flytte seg").
- Hover-promotion er deaktivert i `routePlanning`-modus (pointer-events allerede `none` på de fleste underliggende panes — vi sjekker `modeRef.current`).

## Filer som endres

- ny: `src/lib/mapHoverPromotion.ts`
- `src/lib/mapDataFetchers.ts` — koble på `attachHoverPromotion` i relevante `onEachFeature`
- `src/components/OpenAIPMap.tsx` — koble på i NSM/RPAS/CTR/AIP-rendering, og pane-init beholdes uendret

## Risiko / detaljer

- Endre pane z-index midt i hover er en lovlig DOM-operasjon, men gjør det via `pane.style.zIndex = String(n)` (ikke via Leaflet API som ikke finnes).
- Husk å fjerne handlere når laget tas av kartet (`layer.on('remove', cleanup)`) for å unngå at promotion blir hengende dersom diff-render fjerner feature mens den er hovret.
- `diffRender`-cachen er kompatibel — hover-state er per layer, og nye layers får hover påkoblet i `onEachFeature`.
