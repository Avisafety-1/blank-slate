
# Fiks befolkningslaget: Korrekt WMS-URL og lag-navn (SSB)

## Hva er galt

Den implementerte WMS-tjenesten peker på en URL som returnerer 404:
- **Brukt (feil)**: `https://kart.ssb.no/arcgis/services/ekstern/befolkning_paa_rutenett/MapServer/WMSServer?`
- **Feil lag-navn**: `befolkning_paa_rutenett_1000m`

SSB har en ny API-struktur. GetCapabilities bekrefter at riktig endepunkt er:
- **Riktig URL**: `https://kart.ssb.no/api/mapserver/v1/wms/befolkning_paa_rutenett`
- **Riktig lag-navn for 1km 2025**: `befolkning_1km_2025`

## Endringer

### `src/components/OpenAIPMap.tsx` — linje 739–751

Oppdater WMS-URL og lag-navn i `L.tileLayer.wms`-kallet:

```tsx
// Fra (feil):
const befolkningLayer = L.tileLayer.wms(
  "https://kart.ssb.no/arcgis/services/ekstern/befolkning_paa_rutenett/MapServer/WMSServer?",
  {
    layers: "befolkning_paa_rutenett_1000m",
    ...
  }
);

// Til (riktig):
const befolkningLayer = L.tileLayer.wms(
  "https://kart.ssb.no/api/mapserver/v1/wms/befolkning_paa_rutenett",
  {
    layers: "befolkning_1km_2025",
    ...
  }
);
```

SSB-tjenesten støtter EPSG:3857 (standard for Leaflet/nettkartet), så ingen CRS-endringer er nødvendig.

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/OpenAIPMap.tsx` | Korriger WMS-URL og lag-navn for befolkningslaget |

## Forventet resultat

Etter fiksen skal «Befolkning 1km² (SSB)»-laget i kartlag-panelet vise fargekodet rutenett over kartet når det aktiveres, og tegnforklaringen vil vises nederst.
