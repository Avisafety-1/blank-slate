

## Fix: NOTAM-popup forsvinner ved kart-panorering

### Problem
Når man klikker på et NOTAM-område og Leaflet panorerer kartet for å vise popup-en, utløses `moveend`-eventet. Dette kaller `fetchNotamsInBounds()` som starter med `layer.clearLayers()` — og dermed fjernes popup-en umiddelbart.

### Løsning
Sjekke om det finnes en åpen popup i NOTAM-laget før oppdatering. Hvis en popup er åpen, hopp over oppdateringen (eller utsett den til popup-en lukkes).

### Endringer

**`src/lib/mapDataFetchers.ts`** — Legg til sjekk i `fetchNotamsInBounds`:
```ts
// Sjekk om en NOTAM-popup er åpen — i så fall, ikke oppdater
let hasOpenPopup = false;
layer.eachLayer((l: any) => {
  if (l.getPopup?.()?.isOpen?.()) hasOpenPopup = true;
  // Also check sub-layers (geoJSON groups)
  if (l.eachLayer) {
    l.eachLayer((sub: any) => {
      if (sub.getPopup?.()?.isOpen?.()) hasOpenPopup = true;
    });
  }
});
if (hasOpenPopup) return;
```

Denne sjekken plasseres rett etter `layer.clearLayers()` erstattes — dvs. **før** `clearLayers()` kalles.

### Resultat
Popup-en forblir synlig etter at kartet har panorert. Neste gang brukeren selv panorerer/zoomer (etter at popup-en er lukket), oppdateres NOTAM-laget som normalt.

### Fil som endres
- `src/lib/mapDataFetchers.ts` — 1 endring (legg til popup-sjekk før clearLayers)

