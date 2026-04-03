

## Legg til CTR/TIZ-sjekk i luftromsadvarsler

### Problem
Funksjonen `check_mission_airspace` ble skrevet om da NOTAMs ble lagt til, og `rpas_ctr_tiz`-tabellen ble utilsiktet utelatt. Dermed får man ingen advarsler når ruten er innenfor en CTR/TIZ-sone (med mindre den også er i en 5km-sone).

### Løsning
Legge tilbake `rpas_ctr_tiz` som en `UNION ALL`-blokk i `candidate_zones`-spørringen, og endre severity fra `'INFO'` til `'CAUTION'` for CTR/TIZ.

### Endringer

**1. Ny migrasjon** — oppdater `check_mission_airspace`-funksjonen:
- Legg til `rpas_ctr_tiz` i `candidate_zones`:
```sql
UNION ALL
-- RPAS CTR/TIZ zones
SELECT
  ct.id::text,
  COALESCE(ct.properties->>'Zone', 'CTR/TIZ'),
  COALESCE(ct.name, 'Ukjent'),
  ct.geometry
FROM rpas_ctr_tiz ct
WHERE ct.geometry IS NOT NULL
  AND ST_DWithin(ct.geometry::geography, v_envelope::geography, 50000)
```

- Endre severity-mapping for CTR/TIZ fra `'INFO'` til `'CAUTION'`:
```sql
WHEN rc.cz_type IN ('CTR', 'TIZ', 'CTR/TIZ') THEN 'CAUTION'
```

**2. `src/components/dashboard/AirspaceWarnings.tsx`** — ingen endring nødvendig (håndterer allerede CTR/TIZ korrekt med riktig melding om 120m AGL).

### Teknisk detalj
`rpas_ctr_tiz`-tabellen har kolonnene `id`, `name`, `geometry` og `properties` (med `Zone`-felt som angir om det er CTR eller TIZ). Tabellen er allerede indeksert med GIST.

