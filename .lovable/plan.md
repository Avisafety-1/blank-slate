

## Ytelses- og stabilitetsfix for /oppdrag

### Problemer fra Sentry

1. **N+1 API-kall**: Hver `MissionMapPreview` kjører sin egen `SELECT * FROM aip_restriction_zones` query. Med f.eks. 10 synlige oppdrag = 10 identiske spørringer mot databasen. Dette er den primære årsaken til treg lasting (p95 opp mot 10s).

2. **Leaflet `_leaflet_pos` TypeError**: Skjer når kartet fjernes (`map.remove()`) mens en zoom-animasjon pågår. Typisk ved rask scrolling gjennom oppdragslisten — MissionMapPreview mounter/unmounter kart raskt.

3. **39% failure rate**: Sannsynligvis kombinasjon av nettverkstimeout fra N+1-kall og Leaflet-krasj.

### Løsning

#### 1. Eliminer N+1: Shared AIP-zone cache

Opprett en enkel modul-level cache i `mapDataFetchers.ts` (eller ny fil `lib/aipZoneCache.ts`):
- En `Promise`-basert singleton som henter `aip_restriction_zones` en gang
- Alle `MissionMapPreview`-instanser bruker cachen i stedet for egne queries
- Cache-TTL: 5 min (zonene endres sjelden)
- `MissionMapPreview.tsx` kaller `getAipZones()` i stedet for direkte Supabase-query

#### 2. Fix Leaflet TypeError

I `MissionMapPreview.tsx`, legg til guard i cleanup:
- Sett `isMounted = false` (allerede gjort)
- Wrapp `map.remove()` i try/catch for å fange zoom-animasjon race condition
- Legg til `map.stop()` før `map.remove()` for å stoppe pågående animasjoner

#### 3. Lazy-load MissionMapPreview

MissionMapPreview renderes for ALLE synlige oppdragskort, selv de som ikke er synlige i viewport. Wrapp i `IntersectionObserver` slik at kartet kun initialiseres når kortet scrolles inn i visningen. Dette reduserer antall samtidige kart-initialiseringer dramatisk.

### Filer som endres

- **`src/lib/aipZoneCache.ts`** (ny) — Shared cache for AIP-soner
- **`src/components/dashboard/MissionMapPreview.tsx`** — Bruk cache i stedet for direkte query, try/catch på map.remove(), IntersectionObserver for lazy-loading
- **`src/lib/mapDataFetchers.ts`** — Eventuelt eksporter cache-funksjonen herfra i stedet for ny fil

### Forventet effekt
- N+1 → 1 query uansett antall oppdrag
- Leaflet-krasj eliminert
- Raskere sidelasting (færre samtidige nettverkskall + færre kartinstanser)

