
## Fiks kraftledninger-laget ved å bytte fra WMS til ArcGIS GeoJSON

### Hva jeg fant
Problemet er sannsynligvis ikke bare zoom. NVE-dataene finnes, men den valgte **WMS-løsningen svarer ikke brukbart**:
- `GetMap` mot `.../WmsServer` gir `Parameter 'layers' contains unacceptable layer names`
- Samme datasett fungerer derimot via **ArcGIS REST query** på `.../MapServer/{layerId}/query?...&f=geojson`

Det betyr at toggleen kan være “på”, men laget har fortsatt ingen gyldig kartgrafikk å vise.

### Løsning
Bytt implementasjonen fra et WMS-tilelag til et **vektorlag hentet fra ArcGIS REST** innenfor gjeldende kartutsnitt.

### Endringer

#### 1. `src/components/OpenAIPMap.tsx`
- Erstatt `kraftledningerLayer = L.tileLayer.wms(...)` med `L.layerGroup()`
- Registrer dette fortsatt som `id: "kraftledninger"`
- Legg til egen pane, f.eks. `powerPane`, så laget får riktig z-index og kan skrus av/på uten å kollidere med andre lag
- Når laget toggles på:
  - kjør en fetch med én gang
- Når kartet flyttes/zoomes:
  - hent data på nytt **kun hvis laget er aktivert**
- Når laget toggles av:
  - tøm layer group

#### 2. `src/lib/mapDataFetchers.ts`
Legg til en ny helper, f.eks. `fetchKraftledningerInBounds(...)`, som:
- bruker ArcGIS REST query-endepunkter:
  - `MapServer/0` = transmisjonsnett
  - `MapServer/1` = regionalnett
  - `MapServer/2` = distribusjonsnett
  - `MapServer/3` = sjøkabler
  - `MapServer/5` = transformatorstasjoner
- sender inn viewport som geometri/filter
- ber om `outSR=4326&f=geojson`
- renderer:
  - linjer som `L.geoJSON(...)`
  - stasjoner som `pointToLayer(...)`

### Foreslått datalogikk
Bruk zoomstyring for å unngå for mye data:
- zoom 8+: transmisjonsnett + regionalnett
- zoom 11+: sjøkabler + transformatorstasjoner
- zoom 12/13+: distribusjonsnett
- hopp over `Master og stolper` i første versjon, siden det blir ekstremt tett

Dette gir et lag som faktisk blir synlig uten å overbelaste kartet.

### Visuell stil
- Transmisjonsnett: tydelig blå/grønn
- Regionalnett: oransje
- Distribusjonsnett: lysere gul/oransje
- Sjøkabler: stiplet cyan
- Transformatorstasjoner: små sirkelmarkører

Popup kan vise:
- type
- eier
- spenning (kV)
- navn når det finnes

### Ekstra hardening
Jeg ville også samtidig sikre `setGeoJsonInteractivity(...)` i `OpenAIPMap.tsx`:
- ikke kall `addInteractiveTarget` / `removeInteractiveTarget` hvis layer ikke lenger har map eller DOM-element
- dette matcher runtime-feilene du har nå fra Leaflet og gjør kartet mer stabilt ved refresh/hot reload

### Hvorfor dette er riktig retning
Den nåværende WMS-veien ser ut til å være feil/uforenlig for dette datasettet i Leaflet-oppsettet deres. ArcGIS REST-query fungerer faktisk og lar oss:
- hente ekte data
- begrense til viewport
- style laget tydeligere
- få popups og bedre kontroll på ytelse

### Filer som endres
1. `src/components/OpenAIPMap.tsx`
2. `src/lib/mapDataFetchers.ts`

### Testing
Etter implementasjon bør vi teste:
1. slå på “Kraftledninger (NVE)”
2. zoome inn over Trondheim/Oslo-området
3. bekrefte at linjer og stasjoner vises
4. slå laget av/på flere ganger
5. sjekke at route planning fortsatt fungerer uten at laget stjeler klikk
