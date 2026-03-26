

## Optimalisere luftromssjekk (`check_mission_airspace`)

### Problem
Funksjonen `check_mission_airspace` spør nå 5 tabeller med `ST_DWithin(geometry::geography, ...)`. De to nye tabellene (`naturvern_zones`, `vern_restriction_zones`) mangler **geography-cast GIST-indekser**, som betyr at PostgreSQL gjør full sekvensielt scan med tung geography-konvertering per rad. Dette gjor at RPC-kallet tar for lang tid.

### Løsning

#### 1. Ny migrasjon: Geography GIST-indekser + statement_timeout

Legg til de manglende indeksene (samme mønster som AIP/NSM/RPAS-tabellene fikk i migrasjon `20260318`):

```sql
CREATE INDEX IF NOT EXISTS idx_naturvern_zones_geog
  ON naturvern_zones USING gist ((geometry::geography));

CREATE INDEX IF NOT EXISTS idx_vern_restriction_zones_geog
  ON vern_restriction_zones USING gist ((geometry::geography));
```

Legg også til `SET statement_timeout = '8s'` på funksjonen for å hindre at den henger for lenge.

#### 2. Optimaliser SQL-funksjonen

Oppdater `check_mission_airspace` med to forbedringer:
- Naturvern og vern-restriksjoner bruker kun **2 km** radius i stedet for 5 km (disse er informasjonelle, ikke kritiske luftromssoner)
- Legg til `LIMIT 200` på hele resultatet for å begrense responsstørrelse
- Sett `statement_timeout` til 8 sekunder som sikkerhetsnett

#### 3. Klient-side: allerede OK
`AirspaceWarnings.tsx` har allerede 8s timeout med `AbortController`. Ingen endringer trengs i frontend.

### Filer som endres
1. **Ny migrasjon** -- geography GIST-indekser + oppdatert `check_mission_airspace` med lavere radius og timeout

