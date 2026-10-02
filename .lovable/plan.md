# Testfunksjon `dji-geo-test` mot DJI Geo Zones API

## Mål
En engangs edge-funksjon (kun testing, ikke koblet til UI) som kaller DJI sitt geo-API direkte og returnerer status + sammendrag, slik at vi ser nøyaktig hva DJI svarer.

## Funksjonen

**`supabase/functions/dji-geo-test/index.ts`** (ca. 120 linjer):

1. **Input**: query-parametre `lat`, `lng` (obligatoriske – 400 hvis de mangler eller ikke er tall), `drone` (default `dji-mavic-3`), `radius` (default `20000`, maks 50000).

2. **Kall 1 – geo-soner**:
   ```
   GET https://www-api.dji.com/api/geo/areas
     ?drone=<drone>&zones_mode=total&country=NO
     &level=0,1,2,3,4,6,7&lat=<lat>&lng=<lng>&search_radius=<radius>
   ```
   Returnerer: HTTP-status fra DJI, antall `areas`, og per area: `name`, `level`, `color`, `height`, `shape`, `type`, samt boolske flagg `has_polygon_points` og `has_sub_areas`.

3. **Kall 2 – støttede droner**:
   ```
   GET https://flysafe-api.dji.com/dji/drones
   ```
   Returnerer listen over drone-ID-er i samme respons.

4. **Logging**: hele råsvaret fra begge kall logges til konsollen (`console.log`).

5. **Respons** (JSON):
   ```json
   {
     "geo": { "status": 200, "area_count": 12, "areas": [ ... ] },
     "drones": { "status": 200, "drone_ids": [ ... ] }
   }
   ```
   Ved DJI-feil returneres status og de første ~500 tegnene av svaret.

## Sikkerhet og rammer
- `verify_jwt = false` i `supabase/config.toml` (samme mønster som øvrige testfunksjoner). Funksjonen leser ingen data og kan ikke skrive noe.
- Bruker `safeFetch` fra `_shared/http.ts` med allowlist `www-api.dji.com` og `flysafe-api.dji.com`.
- Ingen nøkler, ingen databasekall, ingen endring i UI, kart eller eksisterende funksjoner.

## Verifisering
- Deploy via deploy-verktøyet.
- Testkall med `curl_edge_functions` mot et punkt i Norge (f.eks. Oslo-området) og vis resultatet.
- Funksjonen kan slettes etter testen hvis du vil.
