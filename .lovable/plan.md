
# Nytt kartlag: Befolkning 1km² (SSB) med fargeskala-tegnforklaring

## Hva som skal gjøres

Brukerens bilde viser SSBs offisielle tegnforklaring for befolkning på rutenett 1km²:

- 1–9 bosatte per km²
- 10–19 bosatte per km²
- 20–99 bosatte per km²
- 100–499 bosatte per km²
- 500–1 999 bosatte per km²
- 2 000–4 999 bosatte per km²
- 5 000 eller flere bosatte per km²

Dette implementeres som et nytt WMS-kartlag + en tilhørende tegnforklaring med nøyaktig samme fargeskala og kategorier som SSB bruker.

## Teknisk plan

### 1. Nytt WMS-lag i `OpenAIPMap.tsx`

Etter det eksisterende `arealbrukLayer`-blokken (linje 735) legges et nytt SSB WMS-lag til:

```tsx
// SSB Befolkning 1km² rutenett
const befolkningLayer = L.tileLayer.wms(
  "https://kart.ssb.no/arcgis/services/ekstern/befolkning_paa_rutenett/MapServer/WMSServer?",
  {
    layers: "befolkning_paa_rutenett_1000m",
    format: "image/png",
    transparent: true,
    opacity: 0.65,
    attribution: 'Befolkning 1km² © <a href="https://www.ssb.no">SSB</a>',
    minZoom: 0,
    maxZoom: 20,
    tiled: true,
    version: "1.3.0",
  } as any
);
layerConfigs.push({
  id: "befolkning1km",
  name: "Befolkning 1km² (SSB)",
  layer: befolkningLayer,
  enabled: false,
  icon: "users",
});
```

### 2. Ny komponent `BefolkningLegend.tsx`

En tegnforklaring identisk med SSBs fargeskala (YlOrRd — gul → oransje → rød → mørk rød → nesten svart):

```
Farge      Kategori
#ffffb2    1–9 bosatte per km²
#fecc5c    10–19 bosatte per km²
#fd8d3c    20–99 bosatte per km²
#f03b20    100–499 bosatte per km²
#bd0026    500–1 999 bosatte per km²
#800026    2 000–4 999 bosatte per km²
#400010    5 000 eller flere bosatte per km²
```

Komponenten posisjoneres på samme måte som `ArealbrukLegend` — horisontalt sentrert nederst — men viser kategorier vertikalt i en kompakt boks siden det er 7 klasser (ikke 6 horisontale chips som Arealbruk).

### 3. Registrer i `OpenAIPMap.tsx`

Legg til import øverst og vis tegnforklaringen betinget:

```tsx
import { BefolkningLegend } from "@/components/BefolkningLegend";

// ...i JSX etter ArealbrukLegend:
{layers.find(l => l.id === "befolkning1km")?.enabled && (
  <BefolkningLegend />
)}
```

## Filer som endres/opprettes

| Fil | Handling |
|---|---|
| `src/components/BefolkningLegend.tsx` | Ny fil — tegnforklaring med SSBs 7 kategorier og farger |
| `src/components/OpenAIPMap.tsx` | Legg til WMS-lag + import + betinget rendering av legend |

## Brukeropplevelse

- Laget vises i «Kartlag»-panelet som «Befolkning 1km² (SSB)»
- Deaktivert som standard
- Når aktivert: fargekodet rutenett på kartet med tegnforklaring nederst (identisk med SSBs eget kart)
- Tegnforklaringen er responsiv — kompakt på mobil, litt bredere på desktop

## Merknad om WMS-tilgjengelighet

SSBs WMS-tjeneste er åpent tilgjengelig uten API-nøkkel. Dersom SSBs WMS-endepunkt ikke svarer, vil laget rett og slett ikke vise noe — ingen feil for brukeren. Vi kan ev. fallback-teste endepunktet ved første aktivering.
