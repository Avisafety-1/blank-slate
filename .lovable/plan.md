## Funn

- Den nye `airspace_zones_intersecting_route`-RPC-en er ikke treg alene i test: typiske DE-ruter svarte på ca. 35–120 ms.
- Timeouten ser derfor ikke ut som «bare manglende indeks» i denne RPC-en.
- Den faktiske oppdragskort-/dialog-komponenten gjør først legacy `check_mission_airspace`, og deretter gjør den unified-sjekken sekvensielt per land: `DK`, `SE`, `DE`, `FI`.
- Nettverksloggen viser mange parallelle/repeterte kall mot `airspace_zones_intersecting_route`, og flere timeouter spesielt når ruter sjekkes mot land de ikke ligger i. Dette skaper venting uten nytte.
- `check_mission_airspace` har `statement_timeout = 8s` og er fortsatt NO/legacy-orientert. Unified-data ligger i separat RPC og er bare allowlistet for Moderavdeling.

## Plan

1. **Behold Norge og eksisterende brukere urørt**
   - Ikke endre `check_mission_airspace` sin legacy-logikk for NO.
   - Ikke aktivere unified for andre selskaper enn allowlistet Moderavdeling.
   - Ikke fjerne eller endre eksisterende norske kartlag/advarsler.

2. **Stopp unødvendige land-sjekker i frontend**
   - I `src/lib/airspaceUnified.ts`: legg til en enkel bounding-box/country prefilter for `DK`, `SE`, `DE`, `FI`.
   - Hvis ruten åpenbart ikke overlapper landet, returner `[]` uten Supabase-RPC.
   - Dette vil hindre at en rute i Tyskland sjekkes mot DK/SE/FI, og at norske ruter sjekkes mot alle unified-land.

3. **Gjør unified-rutekall mer robust**
   - Kjør bare relevante unified-land, og helst samlet/avgrenset der det er mulig.
   - Legg inn kort klient-timeout/fail-soft rundt unified-kall, slik at lagring/visning ikke henger selv om én unified-sjekk er treg.
   - Fortsett å ignorere unified-feil for alle utenfor Moderavdeling.

4. **Optimaliser RPC-en litt mer målrettet**
   - Oppdater `airspace_zones_intersecting_route` med en bbox-prefilter før `ST_DWithin(...::geography...)`, slik PostGIS kan bruke `geom` GIST-indeksen først.
   - Behold eksisterende geography-indeks og dedupe-indeks.
   - Dette er en trygg forbedring selv om hovedårsaken virker å være for mange irrelevante kall.

5. **Valider med reelle eksempler**
   - Kjør `EXPLAIN ANALYZE` for tysk rute mot `DE` før/etter RPC-endringen.
   - Test at ruter utenfor DE ikke lenger sender DE-RPC fra klientlogikken.
   - Test at NO/legacy `check_mission_airspace` fortsatt fungerer uendret.

## Teknisk detalj

Foreslått RPC-filter:

```sql
AND z.geom && ST_Expand(v_route, degrees_for_buffer)
AND ST_DWithin(z.geom::geography, v_route::geography, v_buffer)
```

Foreslått frontend-filter:

```ts
const countries = UNIFIED_COUNTRIES.filter(country => routeMayIntersectCountry(country, routePoints, bufferM));
```

Dette angriper timeouten på to nivåer: færre RPC-kall fra UI, og raskere kandidatutvalg i databasen.