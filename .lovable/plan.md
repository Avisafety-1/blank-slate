

## Legg til SSB Arealbruk som kartlag for befolkningstetthet

### Hva dette gir
Et nytt valgbart kartlag i MapLayerControl som viser SSBs arealbruksdata -- bebygde omrader klassifisert etter bruk (bolig, naering, industri, etc.). Dette gir en god visuell indikasjon pa befolkningstetthet og bebyggelse, noe som er relevant for SORA ground risk-vurdering.

Laget er **avskrudd som standard** og kan slas pa via kartlag-panelet.

### Endringer

#### 1. `src/components/OpenAIPMap.tsx`

Legg til et nytt WMS-lag etter naturvernlaget (ca. linje 743), med samme monster som NRL og Naturvern:

```text
const arealbrukLayer = L.tileLayer.wms(
  "https://wms.geonorge.no/skwms1/wms.arealbruk?",
  {
    layers: "arealbruk",
    format: "image/png",
    transparent: true,
    opacity: 0.6,
    attribution: "SSB Arealbruk",
  }
);
```

Legg til i `layerConfigs` med:
- id: `arealbruk`
- name: "Befolkning / Arealbruk (SSB)"
- enabled: false (avskrudd som standard)
- icon: `users`

#### 2. `src/components/MapLayerControl.tsx`

Ingen endring nodvendig -- `users`-ikonet er allerede registrert i `iconMap`.

### Tekniske detaljer

- **WMS-endepunkt:** `https://wms.geonorge.no/skwms1/wms.arealbruk`
- **Lagnavn:** `arealbruk`
- **Projeksjon:** EPSG:3857 (stottet, kompatibelt med Leaflet)
- **Format:** PNG med transparens
- **Kilde:** SSB (Statistisk sentralbyra) via Geonorge
- Viser bebygde omrader fargelagt etter brukstype (bolig, naering, fritid, industri, etc.)
- Ingen API-nokkel nødvendig -- tjenesten er apen

**Filer som endres:**
- `src/components/OpenAIPMap.tsx` (legg til ~15 linjer)

