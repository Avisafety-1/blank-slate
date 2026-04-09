

## Fiks FlightHub 2 rutesending og SORA-buffersoner

### Problem 1: Upload feiler med "region 'us-east-1' is wrong; expecting 'eu-central-1'"

Loggene viser:
```
OSS upload status: 400 body: AuthorizationHeaderMalformed - the region 'us-east-1' is wrong; expecting 'eu-central-1'
```

**Årsak**: `signV4Put` i `flighthub2-proxy/index.ts` (linje 38-39) bruker regex `host.match(/oss-([^.]+)\./)` for å finne AWS-region. Dette matcher Alibaba OSS-URLer (`oss-cn-hangzhou.aliyuncs.com`), men DJI EU returnerer en AWS S3-URL (`s3.eu-central-1.amazonaws.com`). Regexen matcher ikke, så den faller tilbake til `us-east-1`.

**Løsning**: Oppdater region-deteksjonen til å også håndtere AWS S3 URLer:
```
s3.eu-central-1.amazonaws.com → eu-central-1
oss-cn-hangzhou.aliyuncs.com → cn-hangzhou (eksisterende)
```

### Problem 2: SORA-buffersoner vises som "ikke tilgjengelig"

**Årsak**: I `Kart.tsx` linje 591-596 mangler `soraBufferCoordinates`-propen helt:
```tsx
<FlightHub2SendDialog
  open={fh2DialogOpen}
  onOpenChange={setFh2DialogOpen}
  route={currentRoute}
  soraSettings={soraSettings.enabled ? soraSettings : undefined}
  // soraBufferCoordinates mangler!
/>
```

**Løsning**: Beregn buffersone-koordinatene fra `soraGeometry.ts` sine eksporterte funksjoner (`bufferPolyline`/`bufferPolygon`/`computeConvexHull`) basert på gjeldende rute og SORA-innstillinger, og send dem som prop.

### Filer som endres

1. **`supabase/functions/flighthub2-proxy/index.ts`** -- Fiks SigV4 region-deteksjon for AWS S3 URLer (linje 38-39)
2. **`src/pages/Kart.tsx`** -- Beregn og pass `soraBufferCoordinates` til `FlightHub2SendDialog`

