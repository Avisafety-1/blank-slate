

## Legg til minimum zoom-nivå for verneområder

### Problem
Hvis brukeren zoomer langt ut, sendes en spørring som treffer tusenvis av polygoner — unødvendig belastning på DB og nettleser, selv med LIMIT 500.

### Løsning
Legg til en sjekk i `fetchVerneomraader()`-funksjonen i `OpenAIPMap.tsx`: hvis `map.getZoom() < 10`, rydd laget og ikke hent data. Vis eventuelt en liten toast/melding.

### Endring

**Fil: `src/components/OpenAIPMap.tsx`**

I `fetchVerneomraader()`-funksjonen (som kalles ved `moveend`):

```
if (map.getZoom() < 10) {
  naturvernLayer.clearLayers();
  return;
}
```

Dette er 2-3 linjer kode, ingen andre filer berørt.

### Vurdering: Beholde DB vs. bytte til WMS
DB-tilnærmingen er riktig fordi:
- Gir interaktive popups med navn, verneform, restriksjonsdetaljer
- Data er allerede synkronisert og indeksert
- Med min-zoom-guard er belastningen minimal
- WMS ville fjernet all interaktivitet og gjort oss avhengig av ekstern server-tilgjengelighet

