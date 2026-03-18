

## Diagnose: Luftromssjekk (`check_mission_airspace`) er treg

### Rotårsak

Databasestatistikken for `nsm_restriction_zones` og `rpas_5km_zones` er **helt utdatert** — PostgreSQL sin planlegger tror tabellene er tomme (`n_live_tup: 0`), selv om de har 154 og 50 rader. Dette fører til at GIST-indeksene **aldri brukes**:

| Tabell | Rader | Index-scans | Seq-scans |
|--------|-------|-------------|-----------|
| `aip_restriction_zones` | 173 | 616 | 3248 |
| `nsm_restriction_zones` | 154 | **0** | **469** |
| `rpas_5km_zones` | 50 | **0** | **464** |

I tillegg bruker funksjonen `ST_DWithin(geometry::geography, ...)` som krever casting til geography for hver rad — dette er dyrt uten riktig indeks. GIST-indeksene er på `geometry`-typen, ikke `geography`, så selv med oppdatert statistikk er indeksbruken suboptimal for geography-operasjoner.

En enkel `EXPLAIN ANALYZE` viser **369ms** for en 2-punkts rute under lav last. Under høyere belastning (f.eks. rett etter innlogging med dashboard-queries) kan dette lett ta 2-5 sekunder og time ut.

### Løsning

#### 1. Oppdater statistikk + legg til geography-indekser (migrering)

Kjør `ANALYZE` for å oppdatere planleggerens statistikk, og opprett `geography`-castede GIST-indekser slik at `ST_DWithin(...::geography, ..., 50000)` kan bruke indeks direkte:

```sql
ANALYZE aip_restriction_zones;
ANALYZE nsm_restriction_zones;
ANALYZE rpas_5km_zones;

CREATE INDEX IF NOT EXISTS idx_nsm_zones_geog ON nsm_restriction_zones USING gist ((geometry::geography));
CREATE INDEX IF NOT EXISTS idx_rpas_5km_zones_geog ON rpas_5km_zones USING gist ((geometry::geography));
CREATE INDEX IF NOT EXISTS idx_aip_zones_geog ON aip_restriction_zones USING gist ((geometry::geography));
```

#### 2. Legg til timeout-håndtering i AirspaceWarnings-komponenten

Wrap RPC-kallet med en `AbortController` og en 8-sekunders timeout. Ved timeout, vis en advarsel i stedet for evig spinner.

### Filer som endres

| Fil | Endring |
|-----|---------|
| Ny SQL-migrering | `ANALYZE` + geography GIST-indekser |
| `src/components/dashboard/AirspaceWarnings.tsx` | Timeout-håndtering (8s) med feilmelding |

### Forventet resultat

- `ST_DWithin` kan nå bruke GIST-indeks direkte på geography → fra ~370ms til <50ms
- Seq-scans på nsm/rpas elimineres
- Timeout gir brukervennlig feilmelding i stedet for evig lasting

