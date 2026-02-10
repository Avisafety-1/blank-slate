

## Korrekte polygoner for AIP ENR 5.1-soner

### Problem
Alle 16 AIP-soner er lagret som enkle rektangler (4 hjornepunkter), men mange av dem er definert som sirkler eller komplekse polygoner i den offisielle AIP-dokumentasjonen. For eksempel er EN-R102 (Oslo sentrum) en sirkel med radius 2 NM sentrert rundt Stortinget/Oslo sentrum.

### Losning
Oppdatere geometriene i databasen med korrekte former ved hjelp av PostGIS-funksjoner:
- **Sirkler**: Bruk `ST_Buffer(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, radius_meter)::geometry` for a generere sirkelpolygoner med 64 segmenter
- **Komplekse polygoner**: For soner definert med mange koordinatpunkter, bruk korrekte flerpunktspolygoner

### Soner som skal oppdateres

| Sone | Korrekt form | Beskrivelse |
|------|-------------|-------------|
| EN-R102 | Sirkel, ~2 NM radius, senter ca. 59.913N 10.738E | Oslo sentrum |
| EN-R103 | Sirkel, ~0.5 NM radius, senter ca. 59.914N 10.733E | Stortinget/Slottet |
| EN-R104 | Polygon (uregelmessig) | Fornebu |
| EN-P001 | Sirkel, senter ved Sola | Sola forbudsomrade |
| EN-R201 | Polygon (uregelmessig, militaert) | Rygge |
| EN-R202 | Polygon (uregelmessig, militaert) | Orland |
| EN-R203 | Polygon (uregelmessig, militaert) | Bodo |
| EN-R301 | Sirkel, senter ved Haakonsvern | Haakonsvern |
| EN-D301 til EN-D320 | Polygoner (skytefelt, uregelmessig) | Diverse skytefelt |

### Implementering

En enkelt SQL-migrasjon som:

1. Bruker `UPDATE` med `ST_Buffer` for sirkulaere soner (R102, R103, P001, R301)
2. Bruker `UPDATE` med korrekte flerpunktspolygoner for de ovrige sonene basert pa tilgjengelige kartdata
3. For soner der eksakte koordinater ikke er verifisert, bruker bedre tilnaerminger enn rektangler (sirkel basert pa kjent senterpunkt og omtrentlig radius)

### Tekniske detaljer

```text
Migrasjon:

-- Eksempel: EN-R102 Oslo sentrum som sirkel med 2 NM (3704m) radius
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(10.738, 59.913), 4326)::geography,
  3704
)::geometry
WHERE zone_id = 'EN-R102';

-- Eksempel: EN-R103 Stortinget/Slottet som sirkel med ~500m radius
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(10.733, 59.914), 4326)::geography,
  500
)::geometry
WHERE zone_id = 'EN-R103';

-- Lignende for P001, R301 (sirkler)
-- Og forbedrede polygoner for R201, R202, R203, D301-D320
```

```text
Filer som endres:
- supabase/migrations/[timestamp]_fix_aip_zone_geometries.sql (ny)
- Ingen frontend-endringer nodvendig (kartlaget leser geometri direkte fra databasen)
```

### Viktige merknader
- Senterpunkter og radier er basert pa offentlig tilgjengelig informasjon om sonene
- Noen soner (spesielt skytefeltene D301-D320) har komplekse grenser som krever mange koordinatpunkter - disse vil fa forbedrede tilnaerminger
- Etter migrering vil kartlaget automatisk vise korrekte former uten kodeendringer
