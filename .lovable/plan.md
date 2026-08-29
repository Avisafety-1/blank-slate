# Mobildekningskart (4G/5G) som nytt kartlag

## Hva du får

To nye avhukbare kartlag i lagmenyen på `/kart`, under gruppen «Infrastruktur»:

- **Mobildekning 4G**
- **Mobildekning 5G**

Begge er avslått som standard, og kan slås på per bruker — og settes som standard per selskap via «Standard kartlag» i selskapsinnstillinger, akkurat som de andre lagene.

## Datakilde (verifisert)

Nkom sitt offentlige WMS-endepunkt svarer og har egne mobillag:

```text
https://api.nkom.no/geoserverAPI/wms
  Dekningskart:2023 - 4G arealdekning mobil
  Dekningskart:2023 - 5G arealdekning mobil
```

Testet med GetMap i EPSG:3857 (samme projeksjon som Leaflet bruker) — svarte 200 med gyldig PNG, så laget kan legges rett inn som et WMS-lag uten proxy eller nøkkel.

Viktige forbehold som bør stå i kartet/tooltip:

- Dette er **arealdekning** fra Nkom (datasett merket 2023), ikke sanntid og ikke delt per operatør (Telenor/Telia/Ice).
- Dekning i bakkenivå sier ikke direkte hvordan dekningen er i lufta for en drone — laget er en indikasjon, ikke en garanti.

## Omfang

Kun visning. Ingen endring i sikkerhetsanalyse, ruteanalyse, risikovurdering eller database.

## Teknisk

- `src/components/OpenAIPMap.tsx`: to nye `L.tileLayer.wms(...)` med `version: "1.3.0"`, `format: "image/png"`, `transparent: true`, `opacity: ~0.55`, attribusjon «© Nkom – Dekningskart», og `layerConfigs.push({ id: "mobildekning_4g" | "mobildekning_5g", ..., enabled: false, icon: "radio", group: gInf })`.
- `src/config/mapLayers.ts`: to nye katalogoppføringer med samme id/navn/gruppe/ikon og `defaultEnabled: false`, slik at selskapsinnstillingene og kartet ikke drifter fra hverandre.
- i18n: nye nøkler `pages.map.layers.mobileCoverage4g` / `...5g` (og lagmeny-navn) i både `no.json` og `en.json`.
- Ingen migrasjon, ingen edge function, ingen endring i eksisterende lag.

## Etterpå

Hvis du senere vil ha dekningshull markert langs ruten (BVLOS/C2-link), lager vi det som en egen plan — det krever punktspørringer (WMS GetFeatureInfo) mot samme tjeneste.
