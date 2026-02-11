

## Erstatt manuelle AIP-soner med OpenAIP polygon-data

### Bakgrunn
De nåværende AIP-restriksjonssonene (R-102, R-104, D-301 osv.) er manuelt definert med estimerte koordinater og tilnærmede sirkler/polygoner. OpenAIP-kartlaget viser de offisielle grensene, og forskjellen mellom disse skaper forvirring. Losningen er a hente de offisielle polygonene direkte fra OpenAIP sitt API.

### Tilnarming
Opprette en Edge Function som henter luftromsdata fra OpenAIP Core API og lagrer polygonene i `aip_restriction_zones`-tabellen. Dette erstatter de manuelt estimerte geometriene med presise, offisielle data.

### Steg

**1. Ny Edge Function: `sync-openaip-airspaces`**
- Henter norske restriksjonsomrader (Prohibited, Restricted, Danger) fra OpenAIP API:
  - `GET https://api.core.openaip.net/api/airspaces?country=NO&type=1,2,3` (P, R, D-typer)
- Konverterer geometrien til PostGIS-format
- Upsert inn i `aip_restriction_zones` med riktig `zone_id`, `zone_type`, `name`, `geometry`, `upper_limit`, `lower_limit`, `remarks`
- Bruker OpenAIP API-nokkel fra secrets/environment

**2. Oppdater `aip_restriction_zones`-tabellen**
- Legg til kolonne `source` (text) for a skille mellom manuell og automatisk data
- Legg til kolonne `openaip_id` (text) for a koble til OpenAIP sin ID

**3. Oppdater kartvisningen**
- Fjern dobbeltvisning: nar AIP-sonene kommer fra OpenAIP trenger vi ikke vise bade OpenAIP tile-laget og vart eget polygon-lag for de samme sonene
- Alternativt: behold begge, men la brukeren sla av/pa hvert lag separat (dette fungerer allerede)

**4. Legg til manuell sync-knapp i Admin**
- Knapp i admin-panelet for a trigge synkronisering
- Viser resultat (antall oppdaterte soner)

### Tekniske detaljer

**OpenAIP API-kall:**
```text
GET https://api.core.openaip.net/api/airspaces
  ?country=NO
  &type=1,2,3    (1=Prohibited, 2=Restricted, 3=Danger)
  &limit=500
Headers: x-openaip-client-id: <API_KEY>
```

**Respons-format (forenklet):**
```text
{
  "items": [
    {
      "_id": "abc123",
      "name": "EN-R102 OSLO",
      "type": 2,
      "country": "NO",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[10.72, 59.90], ...]]
      },
      "upperLimit": { "value": 3000, "unit": 1, "referenceDatum": 1 },
      "lowerLimit": { "value": 0, "unit": 1, "referenceDatum": 1 }
    }
  ]
}
```

**Database-migrering:**
```text
ALTER TABLE aip_restriction_zones 
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS openaip_id text;
```

**Edge Function pseudokode:**
```text
1. Fetch airspaces from OpenAIP API (country=NO, type=1,2,3)
2. For each airspace:
   a. Map type (1->P, 2->R, 3->D)
   b. Extract zone_id from name (e.g. "EN-R102")
   c. Convert geometry to PostGIS via ST_GeomFromGeoJSON
   d. Upsert into aip_restriction_zones
3. Return summary of synced zones
```

**Filer som endres:**
- `supabase/functions/sync-openaip-airspaces/index.ts` (ny)
- `supabase/config.toml` (registrer ny funksjon)
- Ny migrering for kolonnene `source` og `openaip_id`
- Valgfritt: admin-knapp i `src/pages/Admin.tsx`

### Fordeler
- Presise, offisielle polygoner som matcher OpenAIP-kartlaget
- Automatisk synkronisering istedenfor manuelt arbeid
- Bedre noyaktighet i luftromsadvarsler (check_mission_airspace)

