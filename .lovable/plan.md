

## Legg til kartlag for høyspentledninger (NVE)

### Bakgrunn
Den opplastede filen er en **WMS-feilmelding**, ikke kartdata. Men NVE tilbyr en offentlig WMS/ArcGIS-tjeneste for nettanlegg (høyspentlinjer, master, transformatorstasjoner osv.) som vi kan bruke.

**Kilde**: NVE Nettanlegg — `https://gis3.nve.no/map/services/Nettanlegg3/MapServer/WMSServer`

### Løsning
Legg til et nytt valgfritt kartlag «Kraftledninger (NVE)» i `OpenAIPMap.tsx`, med samme mønster som NRL, Arealbruk og Befolkning-lagene.

### Endringer

**`src/components/OpenAIPMap.tsx`**:
- Legg til et nytt WMS-lag etter NRL-laget:
```ts
const kraftledningerLayer = L.tileLayer.wms(
  "https://gis3.nve.no/map/services/Nettanlegg3/MapServer/WMSServer?",
  {
    layers: "0,1,2,3",  // Kraftledninger, master, trafostasjoner, sjøkabler
    format: "image/png",
    transparent: true,
    opacity: 0.7,
    attribution: 'Nettanlegg © <a href="https://www.nve.no">NVE</a>',
  }
);
layerConfigs.push({
  id: "kraftledninger",
  name: "Kraftledninger (NVE)",
  layer: kraftledningerLayer,
  enabled: false,
  icon: "alertTriangle",
});
```
- Laget er **av som standard** og kan slås på via kartlag-kontrollen.

**`src/components/MapLayerControl.tsx`**:
- Eventuelt legge til et `Zap`-ikon fra lucide-react i `iconMap` for bedre visuell representasjon (lynsymbol for strøm).

### Teknisk detalj
NVE Nettanlegg3 MapServer eksponerer WMS-endepunkt. Layer-IDer (0, 1, 2, 3 osv.) dekker ulike elementer i kraftnettet. Vi starter med de viktigste lagene og justerer ved behov.

