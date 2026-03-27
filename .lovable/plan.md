

## Fiks kraftledninger-kartlaget (NVE)

### Problem
Kartlaget bruker `gis3.nve.no/map/services/Nettanlegg3/MapServer/WMSServer` som ikke returnerer synlige data. Tjenesten er utdatert.

### Funn fra undersøkelse
- NVE har oppgradert til **Nettanlegg4** på `nve.geodataonline.no`
- Layers 0-6 har alle `defaultVisibility: false` og **skaleavhengig visning** (f.eks. Transmisjonsnett synlig opp til 1:10M, Distribusjonsnett kun under 1:640K)
- Feature-query bekrefter at data finnes (kraftledninger med eier, spenning, etc.)
- Den gamle Nettanlegg3-tjenesten returnerer konsekvent blanke bilder

### Løsning
Oppdater `OpenAIPMap.tsx`:

1. **Bytt URL** til Nettanlegg4: `https://nve.geodataonline.no/arcgis/services/Nettanlegg4/MapServer/WmsServer?`
2. **Bruk korrekte lag-navn**: `Transmisjonsnett_luftledning,Regionalnett_luftledning,Distribusjonsnett,Sjokabler,Transformatorstasjoner`
3. **Legg til `minZoom: 8`** på Leaflet-laget slik at det kun vises når zoomet nok inn til at WMS-tjenesten faktisk tegner features
4. **Legg til `version: '1.1.1'`** for kompatibilitet med ArcGIS WMS

### Endring i kode
```ts
// FRA:
const kraftledningerLayer = L.tileLayer.wms(
  "https://gis3.nve.no/map/services/Nettanlegg3/MapServer/WMSServer?",
  { layers: "0,1,2,3", ... }
);

// TIL:
const kraftledningerLayer = L.tileLayer.wms(
  "https://nve.geodataonline.no/arcgis/services/Nettanlegg4/MapServer/WmsServer?",
  {
    layers: "Transmisjonsnett_luftledning,Regionalnett_luftledning,Distribusjonsnett,Sjokabler,Transformatorstasjoner",
    format: "image/png",
    transparent: true,
    opacity: 0.8,
    version: "1.1.1",
    attribution: 'Nettanlegg © <a href="https://www.nve.no">NVE</a>',
  }
);
```

### Fil som endres
- `src/components/OpenAIPMap.tsx` — oppdater WMS-URL og lag-parametere

### Risiko
Hvis NVE-tjenesten fortsatt ikke viser data (skaleavhengighet kan gjøre at lite vises ved lav zoom), kan vi som alternativ hente GeoJSON fra feature-endepunktet og tegne linjene client-side.

