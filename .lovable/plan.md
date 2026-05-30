# Kartlag: Eiendomsgrenser

Legge til et nytt valgbart kartlag som viser eiendomsgrenser fra Kartverket (Matrikkelen) i hovedkartet.

## Datakilde

Kartverket sin åpne WMS for matrikkelen:
- URL: `https://wms.geonorge.no/skwms1/wms.matrikkelen-eiendomskart`
- Lag: `teig`, `teiggrense`, `teigpunkt`, `grensepunkt`
- Format: `image/png`, transparent, versjon `1.3.0`
- Åpne data, ingen API-nøkkel.
- Dekker kun Norge (skjules naturlig utenfor).

## Endring

Fil: `src/components/OpenAIPMap.tsx`

1. Definere WMS-laget sammen med øvrige WMS-lag (rundt linje 690):
   ```ts
   const eiendomsgrenserLayer = L.tileLayer.wms(
     "https://wms.geonorge.no/skwms1/wms.matrikkelen-eiendomskart?",
     {
       layers: "teig,teiggrense,grensepunkt",
       format: "image/png",
       transparent: true,
       opacity: 0.8,
       attribution: "© Kartverket – Matrikkelen",
       version: "1.3.0",
       minZoom: 13,
       tiled: true,
     } as any
   );
   ```
   Min-zoom 13 fordi grensene er meningsløse på lavere zoom og laget blir tungt.

2. Registrere som toggle i `layerConfigs` under gruppen `Infrastruktur` (etter `kraftledninger`, ca. linje 766):
   ```ts
   layerConfigs.push({
     id: "eiendomsgrenser",
     name: "Eiendomsgrenser",
     layer: eiendomsgrenserLayer,
     enabled: false,
     icon: "mapPin",
     group: "Infrastruktur",
   });
   ```
   Av som standard for å ikke endre dagens kartopplevelse.

## Avgrensninger

- Klikk for å hente eiendomsinfo (GetFeatureInfo / matrikkelnummer-popup) er ikke en del av denne endringen — kan legges til senere ved behov.
- Kun Norge. Hvis vi senere trenger andre land kan vi legge til tilsvarende kilder per land.
- Ingen endringer i hamburgermeny / opplæringstour fra forrige melding.
