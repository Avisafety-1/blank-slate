

## AIP ENR 5.1 - Forbuds-, restriksjons- og fareomrader som kartlag og luftromsvarsler

### Bakgrunn
Dokumentet AIP ENR 5.1 inneholder permanente forbudsomrader (EN-P), restriksjonsomrader (EN-R) og fareomrader (EN-D) i norsk luftrom. Disse er forskjellige fra NSM-sonene som allerede finnes i systemet - dette er offisielle luftfartsrestriksjoner fra Avinor/Luftfartstilsynet.

### Plan

**1. Lagre dokumentet i prosjektet**
- Kopiere PDF-filen til `docs/` -mappen som referansedokument

**2. Opprette ny databasetabell for ENR 5.1-omrader**
- Ny tabell `aip_restriction_zones` med felter for:
  - `zone_id` (f.eks. EN-R102, EN-D301)
  - `zone_type` (prohibited/restricted/danger - P/R/D)
  - `name` (beskrivende navn)
  - `upper_limit` / `lower_limit` (hoydebegrensninger)
  - `remarks` (tilleggsinfo, aktiveringstider)
  - `geometry` (PostGIS polygon, SRID 4326)
  - `properties` (JSONB for ekstra metadata)
- GIST-indeks pa geometrikolonnen
- RLS-policy for autentiserte brukere

**3. Legge inn polygondata manuelt**
- Trekke ut koordinater fra PDF-dokumentet for de viktigste sonene (EN-P001, EN-R102 Oslo sentrum, EN-R201 Rygge, EN-D301-D320, osv.)
- Konvertere koordinater fra grader/minutter/sekunder til desimalgrader
- Sette inn som SQL INSERT-setninger

**4. Utvide sync-geo-layers edge function**
- Legge til AIP-data som en synkroniserbar kilde (for fremtidig oppdatering)

**5. Oppdatere check_mission_airspace()-funksjonen**
- Legge til et nytt sjekk-segment for `aip_restriction_zones`
- Generere advarsler basert pa sonetype:
  - Forbudsomrader (P): WARNING - "Forbudsomrade, flyving ikke tillatt uten dispensasjon"
  - Restriksjonsomrader (R): WARNING - "Restriksjonsomrade, sjekk vilkar"
  - Fareomrader (D): CAUTION - "Fareomrade, vurder aktivitetsstatus for NOTAM"
- Sjekke bade startpunkt og alle rutepunkter (samme monster som eksisterende soner)

**6. Legge til kartlag i OpenAIPMap**
- Nytt kartlag "AIP Restriksjoner" med egne farger:
  - Forbudsomrader: rod (som NSM)
  - Restriksjonsomrader: lilla/fiolett
  - Fareomrader: gul/oransje
- Popup med sone-ID, navn, hoydebegrensninger og merknader
- Togglebar via MapLayerControl

**7. Oppdatere MissionMapPreview**
- Legge til henting og visning av AIP-soner i oppdragskartforanvisningen (samme monster som NSM/RPAS)

### Tekniske detaljer

```text
Database-migrasjon:

1. CREATE TABLE aip_restriction_zones (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     external_id text UNIQUE,
     zone_id text NOT NULL,        -- f.eks. "EN-R102"
     zone_type text NOT NULL,      -- 'P', 'R', eller 'D'
     name text,
     upper_limit text,
     lower_limit text,
     remarks text,
     geometry geometry(Geometry, 4326),
     properties jsonb DEFAULT '{}',
     synced_at timestamptz DEFAULT now()
   )

2. CREATE INDEX idx_aip_zones_geometry ON aip_restriction_zones USING GIST (geometry)

3. RLS + policy for autentiserte brukere

4. Utvide check_mission_airspace() med ny seksjon for aip_restriction_zones

Data-innsetting:
- INSERT-setninger for alle soner fra PDF
- Koordinater konvertert fra DMS til desimalgrader
```

```text
Filer som endres/opprettes:

Nye filer:
- docs/AIP_ENR_5.1_forbuds_restriksjon_og_fareomrader.gdoc (kopi av opplastet fil)
- supabase/migrations/[timestamp]_aip_restriction_zones.sql

Endrede filer:
- src/components/OpenAIPMap.tsx (nytt kartlag)
- src/components/dashboard/MissionMapPreview.tsx (nytt kartlag)
- src/components/MapLayerControl.tsx (evt. nytt ikon)
- supabase/functions/sync-geo-layers/index.ts (forberedt for fremtidige oppdateringer)
- src/integrations/supabase/types.ts (nye typer)
```

### Viktige merknader
- Koordinatene i AIP ENR 5.1 er i grader/minutter/sekunder-format og ma konverteres
- Noen fareomrader er kun aktive til bestemte tider (NOTAM-basert) - dette vises i remarks
- Dokumentet ma parses manuelt da det er en PDF uten maskinlesbar API
- Fremtidige oppdateringer kan gjores ved a redigere data i databasen eller kjore sync-funksjonen mot en eventuell fremtidig API-kilde

