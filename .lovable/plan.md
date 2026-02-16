

## Beregn AMSL-høyde for SafeSky Advisory basert på terreng og SORA-innstillinger

### Problem
SafeSky advisory og UAV beacon bruker i dag hardkodet `max_altitude: 120` meter. Dette er feil fordi SafeSky forventer AMSL (Above Mean Sea Level), mens 120m representerer AGL (Above Ground Level). En drone som flyr 120m AGL over terreng på 500m MSL bor rapporteres som 620m AMSL.

### Losning
Beregne den hoyeste terrengelevasjonen langs ruten via Open-Meteo (gjenbruke eksisterende `terrain-elevation` edge function / direkte API-kall), og legge til SORA flyhøyde + contingency height for a fa korrekt AMSL.

**Formel:** `max_altitude_amsl = max_terrain_elevation + flightAltitude + contingencyHeight`

### Endringer

#### 1. `supabase/functions/safesky-advisory/index.ts`

**a) Legg til terrengelevasjon-oppslag (ny hjelpefunksjon)**

Legg til en funksjon `fetchMaxTerrainElevation` som tar en liste med rutepunkter og henter elevasjon fra Open-Meteo API direkte (edge function til edge function er unodvendig overhead). Returnerer den hoyeste elevasjonen langs ruten.

```text
async function fetchMaxTerrainElevation(coords: RoutePoint[]): Promise<number>
  - Batch coords i grupper pa 100
  - Kall https://api.open-meteo.com/v1/elevation
  - Returner Math.max(...alle elevasjoner), fallback til 0 ved feil
```

**b) Oppdater `publish_advisory` / `refresh_advisory` (linje 339-469)**

- Les `soraSettings` fra `mission.route` (flightAltitude, contingencyHeight)
- Kall `fetchMaxTerrainElevation` med rutepunktene
- Beregn: `max_altitude = maxTerrain + flightAltitude + contingencyHeight`
- Bruk denne verdien i advisory payload i stedet for hardkodet 120

**c) Oppdater UAV beacon `publish` / `refresh` (linje 473-561)**

- Les `soraSettings` fra `mission.route`
- Kall `fetchMaxTerrainElevation` med forste rutepunkt (eller alle)
- Beregn: `altitude = maxTerrain + flightAltitude`
- Bruk denne verdien i stedet for hardkodet 120

**d) Oppdater `publish_point_advisory` (linje 197-267)**

- Denne bruker pilotposisjon uten rute, sa terrain-oppslag gjores for enkeltpunktet
- Beregn: `max_altitude = terrainAtPoint + 120` (standard flyhøyde, ingen SORA-innstillinger tilgjengelig her)

### Tekniske detaljer

**Ny interface for soraSettings i edge function:**
```typescript
interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
}
```

**MissionRoute interface utvides:**
```typescript
interface MissionRoute {
  coordinates: RoutePoint[];
  totalDistance?: number;
  soraSettings?: SoraSettings;
}
```

**Fallback-verdier** hvis soraSettings mangler: `flightAltitude = 120`, `contingencyHeight = 30`

**Filer som endres:**
- `supabase/functions/safesky-advisory/index.ts` -- hovedendringen

Ingen databaseendringer er nodvendige.

