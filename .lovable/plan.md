
## Fiks: SSB Arealbruk WFS-integrasjon i AI-risikovurdering

### Problemet
WFS-kallet returnerer HTTP 400 fordi tre parametere er feil:

1. **`typeName=arealbruk`** -- Korrekt verdi er **`app:SsbArealbrukFlate`**
2. **`outputFormat=application/json`** -- Denne WFS-tjenesten stotter IKKE JSON-output. Den returnerer kun GML/XML (standard WFS 2.0-format)
3. **Bbox-rekkefolgent** -- For WFS 2.0 med EPSG:4326 skal rekkefolgent vaere `lon,lat,lon,lat` (ikke `lat,lon,lat,lon`)

### Verifisert losning
Jeg har testet direkte mot Geonorge WFS og bekreftet at folgende URL fungerer og returnerer data:

```text
https://wfs.geonorge.no/skwms1/wfs.arealbruk
  ?service=WFS&version=2.0.0
  &request=GetFeature
  &typeName=app:SsbArealbrukFlate
  &srsName=EPSG:4326
  &bbox={minLng},{minLat},{maxLng},{maxLat},EPSG:4326
  &count=200
```

Dataene kommer tilbake som XML/GML med folgende egenskaper per feature:
- Arealbrukskategori (f.eks. "Uklassifisert", "TransportTelek", "Bolig", "Naering")
- Bebyggelsestype (f.eks. "Beb", "AnnenVeg", "Frittliggende")

### Endringer i `supabase/functions/ai-risk-assessment/index.ts`

#### 1. Rett WFS URL (linje 253)
- Endre `typeName=arealbruk` til `typeName=app:SsbArealbrukFlate`
- Fjern `outputFormat=application/json` (bruk standard GML/XML)
- Bytt bbox-rekkefolgent til `minLng,minLat,maxLng,maxLat`

#### 2. Parse XML i stedet for JSON (linje 257-266)
Siden tjenesten returnerer GML/XML, ma vi:
- Lese responsen som tekst
- Bruke enkel regex-basert XML-parsing for a hente ut arealbrukskategori og bebyggelsestype fra `<app:arealbruksomrade>` og `<app:bebyggelsestype>` elementer
- Telle kategorier som for

#### 3. Oppdater kategori-matching (linje 270-276)
Tilpass kategori-sjekken til de faktiske SSB-kodene:
- **Bolig**: "Bolig", "Beb" (bebyggelse)
- **Offentlig**: "OffentligPrivatTjenesteyting", "Skole", "Sykehus"
- **Naering**: "Naering", "Handel"
- **Industri**: "Industri", "Lager"
- **Transport**: "TransportTelek", "AnnenVeg", "Jernbane"
- **Fritid**: "Fritid", "Idrett", "Park"

### Filer som endres
- `supabase/functions/ai-risk-assessment/index.ts` (linje 221-310)
