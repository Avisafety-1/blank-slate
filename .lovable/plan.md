

## Integrer SSB Arealbruk-data i AI-risikovurderingen

### Hva dette gjor
Nar AI-risikovurderingen kjores, henter edge-funksjonen automatisk arealbruksdata fra Geonorge WFS-tjenesten for oppdragets koordinater/rute. AI-en far da vite om flyomradet inneholder boligomrader, industri, offentlige tjenester osv., og bruker dette til a beregne ground risk-kategori (SORA-kompatibel) automatisk -- i stedet for a stole utelukkende pa pilotens manuelle input om "naerhet til mennesker".

### Tilnærming

SSB Arealbruk er tilgjengelig som WFS (Web Feature Service) pa `https://wfs.geonorge.no/skwms1/wfs.arealbruk`. Edge-funksjonen sender en `GetFeature`-forespørsel med et bounding box rundt oppdragets koordinater/rute, og far tilbake GeoJSON med arealbrukskategorier (bolig, naering, industri, fritid, offentlig, transport).

Disse dataene mappes til en SORA-kompatibel befolkningstetthet-klassifisering:
- **Lav** (ubebodd): Kun fritid/park, ingen bolig/naering
- **Moderat**: Noe naering/offentlig, begrenset bolig
- **Hoy** (tett befolket): Betydelig boligomrade eller offentlige tjenester

Klassifiseringen sendes inn som en del av kontekst-dataene til AI-modellen, som bruker den i sin ground risk-vurdering og overall score-beregning.

### Endringer

#### 1. `supabase/functions/ai-risk-assessment/index.ts`

Legg til et nytt steg (mellom airspace-sjekk og prompt-bygging):

- **Beregn bounding box** fra oppdragets koordinater/rute (eller SORA ground risk buffer hvis tilgjengelig)
- **Kall Geonorge WFS** med `GetFeature`-request og bounding box-filter
- **Parse respons** og tell arealbrukskategorier (bolig, naering, industri, fritid, offentlig, transport)
- **Klassifiser ground risk** basert pa fordelingen av kategorier
- **Legg til i contextData** et nytt felt `landUse` med:
  - `categories`: Liste over arealbrukskategorier funnet i omradet
  - `groundRiskClassification`: "low" / "moderate" / "high"
  - `summary`: Kort tekstbeskrivelse
  - `featureCount`: Antall features per kategori
- **Oppdater system-prompten** med instruksjoner om a bruke arealbruksdataene i ground risk-vurderingen, spesielt i `mission_complexity`-kategorien

#### 2. Oppdatering av AI system-prompt

Legg til en seksjon i system-prompten som instruerer AI-en til a:
- Bruke arealbruksdata som primaerkilde for ground risk-klassifisering
- Vekte boligomrader og offentlige tjenester hoyt i risiko
- Redusere mission_complexity-score nar det er hoy befolkningstetthet
- Flagge det tydelig i `mission_complexity.complexity_factors` og `concerns`

### Tekniske detaljer

**WFS-kall:**
```text
GET https://wfs.geonorge.no/skwms1/wfs.arealbruk
  ?service=WFS
  &version=2.0.0
  &request=GetFeature
  &typeName=arealbruk
  &outputFormat=application/json
  &srsName=EPSG:4326
  &bbox={minLat},{minLng},{maxLat},{maxLng},EPSG:4326
  &count=200
```

**Bounding box:** Beregnes fra rutens koordinater med en buffer pa 200m (eller SORA ground risk buffer-avstand hvis konfigurert). For enkeltpunkt-oppdrag brukes 500m radius.

**Kategori-mapping:**
| SSB-kode | Kategori | Risiko-vekt |
|----------|----------|-------------|
| Bolig | Boligomrade | Hoy |
| Naeringsbebyggelse | Naering/kontor | Moderat-Hoy |
| Offentlig / Institusjon | Offentlig tjeneste | Hoy |
| Industri/lager | Industri | Moderat |
| Fritid/sport/park | Fritid | Lav |
| Transport | Transport | Moderat |

**Feilhåndtering:** Hvis WFS-kallet feiler (timeout, utilgjengelig), logger funksjonen feilen og fortsetter uten arealbruksdata -- vurderingen gjennomfores da som for, basert pa pilotens manuelle input.

**Ingen nye dependencies eller database-endringer.** Alt skjer i edge-funksjonen.

### Filer som endres
- `supabase/functions/ai-risk-assessment/index.ts`

