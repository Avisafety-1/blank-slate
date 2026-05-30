# Fiks eiendomsgrenser-laget + matrikkelnummer

## Problem

Endepunktet `wms.matrikkelen-eiendomskart` finnes ikke (returnerer `Unable to access file`), så laget viser ingenting. Riktig Kartverket-endepunkt er `wms.matrikkel` med andre lagnavn.

## Endring

Fil: `src/components/OpenAIPMap.tsx` (rundt linje 730, der `eiendomsgrenserLayer` defineres)

Bytt ut WMS-konfigurasjonen til:

```ts
const eiendomsgrenserLayer = L.tileLayer.wms(
  "https://wms.geonorge.no/skwms1/wms.matrikkel?",
  {
    layers: "eiendomsgrense,grensepunkt,eiendoms_id",
    format: "image/png",
    transparent: true,
    opacity: 0.9,
    attribution: "© Kartverket – Matrikkelen",
    version: "1.3.0",
    minZoom: 14,
    tiled: true,
  } as any
);
```

Endringer fra forrige forsøk:
- URL: `wms.matrikkel` (eksisterer) i stedet for `wms.matrikkelen-eiendomskart` (404).
- Lag: `eiendomsgrense` (grenser), `grensepunkt` (hjørnepunkter), `eiendoms_id` (gnr/bnr-etikett — det brukeren etterspør).
- `minZoom: 14` — `eiendoms_id` rendres kun på høyere zoom, og laget blir uleselig zoomet ut.

## GetFeatureInfo ved klikk (gnr/bnr-popup)

Legg til klikk-håndtering for laget i `handleMapClick` (samme mønster som dagens Tensio-håndtering, ca. linje 861):

- Når laget er aktivt og kartet klikkes, kall `GetFeatureInfo` mot samme WMS med `query_layers=eiendomsgrense`, `info_format=application/json`, og vis matrikkelinfo (kommunenr, gnr, bnr, festenr) i en `L.popup`.
- Bruk eksisterende `formatFeatureInfoPopup` for konsistent visning.
- Skjer kun når `eiendomsgrenserLayer` er på kartet og ingen høyere-prioritets klikkhandler (route planning, weather, Tensio) tar over.

## Avgrensninger

- Kun Norge (Kartverket dekker bare Norge).
- Ingen DB- eller backend-endringer.
- Ingen endringer på øvrige kartlag.
