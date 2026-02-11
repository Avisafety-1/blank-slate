

## Fiks ruteplanlegger over AIP-luftromslaget (PC/mus)

### Problem
Nar ruteplanleggeren aktiveres, deaktiveres museklikk pa NSM-, RPAS- og CTR-lagene via `setGeoJsonInteractivity()`. Men AIP-restriksjonslaget (de nye OpenAIP-sonene) har ingen tilsvarende ref, sa de individuelle SVG-elementene beholder `pointer-events: auto` og fanger opp museklikk for de nar kartet.

A sette `pointer-events: none` pa selve pane-elementet fungerer ikke palitelig for mus fordi Leaflet registrerer hendelser direkte pa SVG path-elementene inne i panen.

### Losning

**Fil: `src/components/OpenAIPMap.tsx`**

1. **Legg til en ref for AIP-laget** -- pa samme mate som `nsmGeoJsonRef`, `rpasGeoJsonRef` og `rpasCtrGeoJsonRef`:
   - Opprett `aipGeoJsonLayersRef = useRef<L.GeoJSON[]>([])` for a holde alle individuelle GeoJSON-lag.

2. **Lagre referansene ved oppretting** -- i `fetchAipRestrictionZones()`, etter at hvert `geoJsonLayer` er opprettet, legg det til i `aipGeoJsonLayersRef.current`.

3. **Veksle interaktivitet ved modebytte** -- i `useEffect` som reagerer pa `mode`, iterer gjennom `aipGeoJsonLayersRef.current` og kall `setGeoJsonInteractivity()` pa hvert lag, slik at alle SVG path-elementer far `pointer-events: none` nar ruteplanlegging er aktiv.

### Teknisk detalj

```text
// Ny ref
aipGeoJsonLayersRef = useRef<L.GeoJSON[]>([])

// I fetchAipRestrictionZones, etter geoJsonLayer.addTo(aipLayer):
aipGeoJsonLayersRef.current.push(geoJsonLayer);
// Og for loopen: aipGeoJsonLayersRef.current = [];

// I mode-useEffect, etter eksisterende setGeoJsonInteractivity-kall:
aipGeoJsonLayersRef.current.forEach(layer => {
  setGeoJsonInteractivity(layer, vectorsInteractive);
});
```

### Pavirkning
- Ruteplanlegger fungerer med mus pa PC -- klikk gar gjennom til kartet
- Nar ruteplanlegging avsluttes, blir AIP-sonene klikkbare igjen med popups
- Ingen endring i utseende eller andre funksjoner

