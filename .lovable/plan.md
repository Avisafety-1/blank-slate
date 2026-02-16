
## Fiks: Cron-refresh overstyrer AMSL med hardkodet 120m

### Problem
`safesky-cron-refresh/index.ts` sender `max_altitude: 120` (hardkodet) i advisory payload ved hver refresh (hvert 5. sekund). Dette overskriver den korrekte AMSL-verdien som ble beregnet ved initial publisering. 120 meter = ca. 390 fot, som forklarer det du ser i SafeSky.

`safesky-advisory/index.ts` beregner riktig: `terrain + flightAltitude + contingencyHeight`, men cron-jobben gjor det ikke.

### Losning
Legg til samme AMSL-beregning i cron-refresh-funksjonen:

#### `supabase/functions/safesky-cron-refresh/index.ts`

1. **Legg til `fetchMaxTerrainElevation`-funksjonen** (samme som allerede finnes i `safesky-advisory/index.ts`) -- Open-Meteo API-oppslag med batching.

2. **Legg til SORA-interfaces** (`SoraSettings`, oppdater `MissionRoute` med `soraSettings?`-felt).

3. **Beregn AMSL i advisory-refreshen** (linje 230-246): Erstatt `max_altitude: 120` med:
```text
const sora = route.soraSettings;
const flightAltitude = sora?.flightAltitude ?? 120;
const contingencyHeight = sora?.contingencyHeight ?? 30;
const maxTerrain = await fetchMaxTerrainElevation(route.coordinates);
const maxAltitudeAmsl = Math.round(maxTerrain + flightAltitude + contingencyHeight);
```

### Tekniske detaljer

**Fil som endres:**
- `supabase/functions/safesky-cron-refresh/index.ts`

**Endringspunkter:**
- Legg til `fetchMaxTerrainElevation`-funksjon (ca. 30 linjer, identisk med safesky-advisory)
- Legg til `SoraSettings`-interface og oppdater `MissionRoute`-interface
- Erstatt `max_altitude: 120` (linje 238) med beregnet `maxAltitudeAmsl`
- Legg til logging av AMSL-beregningen

**Ingen databaseendringer.**
