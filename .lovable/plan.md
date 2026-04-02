

## Integrer Live NOTAM i luftromsadvarsler og risikovurdering

### Oversikt
Inkludere aktive NOTAMs fra `notams`-tabellen i `check_mission_airspace`-funksjonen, og fjerne `aip_restriction_zones` (fareområder P/R/D) fra samme funksjon. Dette gjør at NOTAMs automatisk vises i luftromsadvarsler på oppdrag og brukes i AI-risikovurderingen.

### Arkitektur

```text
check_mission_airspace()
  ├── nsm_restriction_zones      (beholdes)
  ├── rpas_5km_zones             (beholdes)
  ├── naturvern_zones            (beholdes)
  ├── vern_restriction_zones     (beholdes)
  ├── aip_restriction_zones      (FJERNES — midlertidig)
  └── notams                     (NY — aktive NOTAMs med geometri)
```

### Tekniske detaljer

**1. Ny migration — legg til PostGIS geometry-kolonne på `notams`**
- `notams` har kun `geometry_geojson` (JSONB), men `check_mission_airspace` trenger en ekte `geometry`-kolonne for `ST_DWithin`/`ST_Intersects`
- Legge til kolonne `geometry geometry(Geometry, 4326)`
- Populere fra eksisterende `geometry_geojson` og `center_lat/center_lng`
- Trigger/oppdatering i `fetch-notams` for å sette geometry ved upsert
- GIST-indeks for ytelse

**2. Oppdatere `check_mission_airspace` SQL-funksjonen**
- Fjerne `aip_restriction_zones`-blokken fra `candidate_zones` CTE
- Legge til `notams`-blokk som henter aktive NOTAMs (der `effective_end IS NULL OR effective_end > NOW()`) med geometri innenfor 50 km
- Sette `z_type = 'NOTAM'`, `z_name` = trunkert NOTAM-tekst (første 80 tegn)
- Severity: `CAUTION` (oppgraderes til `WARNING` hvis ruten krysser NOTAM-sonen)

**3. Oppdatere `AirspaceWarnings.tsx`**
- Legge til håndtering av `z_type === 'NOTAM'` i meldingsformatering
- Inne i sone: `«Aktiv NOTAM i operasjonsområdet: [tekst]. Sjekk restriksjoner.»`
- I nærheten: `«Aktiv NOTAM [distanse] unna: [tekst].»`

**4. Oppdatere `fetch-notams` edge function**
- Sette den nye `geometry`-kolonnen ved upsert (konvertere GeoJSON til PostGIS via `ST_GeomFromGeoJSON`)

### Filer som endres/opprettes
1. **Ny migration** — `geometry`-kolonne + oppdatert `check_mission_airspace`
2. **`supabase/functions/fetch-notams/index.ts`** — sette `geometry`-kolonne ved upsert
3. **`src/components/dashboard/AirspaceWarnings.tsx`** — NOTAM-meldingsformatering

### Merk
- `aip_restriction_zones` fjernes kun fra luftromsadvarsler/risikovurdering — kartlaget «Fareområder (P/R/D)» forblir tilgjengelig på kartet
- NOTAMs uten geometri (4 av 259) ignoreres i romlig sjekk

