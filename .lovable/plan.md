## Problem

Luftfartshindre vises ikke automatisk langs tegnet rute. Ingen nettverkskall mot `openaip_obstacles` registreres når ruten endres.

Årsaken er i `src/lib/routeProximityLayers.ts` → `loadObstacles()`:

- Den gjør `supabase.from("openaip_obstacles").select("openaip_id, name, type, geometry, ...")` uten bbox-filter.
- `geometry`-kolonnen er PostGIS `geometry(Point, 4326)`. Avhengig av PostgREST-respons kan `geom.coordinates` være `undefined`, slik at alle 1500+ rader `continue`-skippes og cachen lagrer en tom liste for hele økten.
- Alle andre nærhetslag (naturvern, vern, CAA) bruker dedikerte bbox-RPCer (`get_naturvern_in_bounds` osv.) som returnerer parsed `geometry`/koordinater — luftfartshindre mangler tilsvarende.

## Endringer

### 1. Ny RPC `get_obstacles_in_bounds`

Migration: returnerer hindre innenfor bbox med lat/lng som tall (parallelt med eksisterende `get_naturvern_in_bounds`-mønster).

```sql
CREATE OR REPLACE FUNCTION public.get_obstacles_in_bounds(
  min_lat double precision, min_lng double precision,
  max_lat double precision, max_lng double precision
) RETURNS TABLE (
  openaip_id text, name text, type text,
  elevation numeric, height_agl numeric,
  lat double precision, lng double precision
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT openaip_id, name, type, elevation, height_agl,
         ST_Y(geometry)::double precision, ST_X(geometry)::double precision
  FROM public.openaip_obstacles
  WHERE geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

GRANT EXECUTE ON FUNCTION public.get_obstacles_in_bounds(double precision,double precision,double precision,double precision) TO authenticated;
```

### 2. `src/lib/routeProximityLayers.ts`

- Endre `loadObstacles(cache, bbox)` til å kalle den nye RPC-en med bbox, og cache pr. `bboxKey(bbox)` (samme mønster som `loadNaturvern`).
- Fjern `obstaclesAll` / `obstaclesPromise` fra `SourceCache`; erstatt med `obstacles: Map<string, ObstacleRecord[]>`.
- `renderObstacles` beholdes; den får allerede ferdig-filtrerte poster i bbox, og bruker `pointInRing(buffer)` for presis 500 m-filtrering.
- I `updateRouteProximityLayers` kalles `loadObstacles(bbox, cache)` med samme `withTimeout`-mønster som de andre lagene.

Ingen endring i `OpenAIPMap.tsx` (kallsignatur for `updateRouteProximityLayers` er uendret; manuell `obstacles`-skip via `activeManualLayers` virker fortsatt).

## Verifisering

- Tegn rute over kjent hindring (f.eks. pipe/skorstein) → rødt trekant-ikon vises automatisk i `routeProximityPane` med "📍 Auto-vist langs ruten"-badge.
- Aktiver "Luftfartshindre" manuelt → auto-laget skipper hindre (ingen duplikater).
- Nettverk: nytt `rpc/get_obstacles_in_bounds`-kall ved hver rute-endring (debounced 300 ms).
