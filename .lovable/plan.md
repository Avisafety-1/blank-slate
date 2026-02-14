

# Fiks: Terrengdata feiler konsistent pga. rate-limiting og parallelle kall

## Rotarsak

Loggene viser to problemer:

1. Terreng-effekten kjorer flere ganger parallelt (flere `Batch 100`-oppforinger pa samme tidspunkt). `cancelled`-flagget forhindrer bare state-oppdateringer, men stopper ikke pagaende fetch-kall.
2. Open-Meteo har blokkert IP-en (selv forste forsok far 429), sa ingen mengde retries hjelper innen kort tid.

## Losning

### 1. Proxy terreng-kall via en Supabase Edge Function med server-side caching

I stedet for a kalle Open-Meteo direkte fra nettleseren (som deler rate-limit med alle andre kall fra samme IP), opprettes en edge function som:
- Tar imot lat/lng-arrays
- Sjekker en Supabase-tabell for cached verdier
- Kun henter manglende verdier fra Open-Meteo
- Lagrer nye verdier i databasen for fremtidige oppslag
- Returnerer resultatet

Dette gir serveren en annen IP (ikke rate-limited), og caching betyr at samme posisjon aldri hentes to ganger.

**Nye filer:**
- `supabase/functions/terrain-elevation/index.ts` - Edge function som proxyer og cacher
- Ny tabell `terrain_elevation_cache` med kolonner: `lat_lng_key TEXT PRIMARY KEY, elevation REAL, created_at TIMESTAMPTZ`

### 2. Avbryt pågaende fetcher med AbortController

Erstatt `cancelled`-flagget med en ekte `AbortController` som avbryter fetch-kall nar effekten re-kjorer eller dialogen lukkes.

**Fil:** `src/components/dashboard/ExpandedMapDialog.tsx`
- Bruk `AbortController` i terreng-effekten
- Send `signal` til fetch-kallene
- I cleanup: `controller.abort()`

### 3. Oppdater klienten til a bruke edge function

**Fil:** `src/lib/terrainElevation.ts`
- Endre `fetchTerrainElevations` til a kalle edge function i stedet for Open-Meteo direkte
- Forenkle retry-logikk (edge function handterer retries server-side)
- Behold downsampling og interpolering pa klientsiden

### 4. Fallback til direkte API hvis edge function feiler

Hvis edge function er utilgjengelig, fall tilbake til direkte Open-Meteo-kall med lengre backoff (10s, 20s, 40s).

## Tekniske detaljer

### Edge Function: `supabase/functions/terrain-elevation/index.ts`

```text
POST /terrain-elevation
Body: { positions: [{ lat: number, lng: number }] }
Response: { elevations: (number | null)[] }

Logikk:
1. Generer cache-nokler fra posisjonene (avrundet til 4 desimaler)
2. Sla opp i terrain_elevation_cache-tabellen
3. For manglende verdier: kall Open-Meteo i batch pa 100
4. Lagre nye verdier i cache-tabellen
5. Returner komplett array
```

### Database: `terrain_elevation_cache`

```text
CREATE TABLE terrain_elevation_cache (
  lat_lng_key TEXT PRIMARY KEY,  -- f.eks. "60.1234,10.5678"
  elevation REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: tillat lesing for alle autentiserte brukere
-- Edge function bruker service_role_key for skriving
```

### Endring i `src/lib/terrainElevation.ts`

```text
fetchTerrainElevations:
  1. Forsok edge function forst (POST med alle posisjoner)
  2. Hvis det feiler: fallback til direkte Open-Meteo med lang backoff
  3. Aksepter optional AbortSignal-parameter
```

### Endring i `src/components/dashboard/ExpandedMapDialog.tsx`

```text
Terreng-effekten:
  1. Opprett AbortController
  2. Send signal til fetchTerrainElevations
  3. Cleanup: controller.abort()
  4. Fjern top-level retry-lokke (edge function handterer dette)
```

## Resultat
- Terreng-kall gar via server med egen IP (ikke rate-limited fra nettleseren)
- Database-cache betyr at samme posisjoner aldri hentes to ganger fra Open-Meteo
- AbortController forhindrer parallelle fetcher
- Fallback sikrer at det fungerer selv om edge function er nede
- Mye raskere for gjentatte oppslag (cache hit)

