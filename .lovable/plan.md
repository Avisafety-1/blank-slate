

## Plan: Fjern Laminar/Cirium NOTAMs og fiks store sirkler

### Problemet
1. **480 Laminar-NOTAMs** ligger fortsatt i databasen (source = null) og overlapper med de 93 RSS-NOTAMs fra notaminfo — dette gir duplikater
2. Noen NOTAMs har Q-line-radius på 200-999 NM, som genererer enorme sirkler som dekker hele Norge (f.eks. A2288/26 med areal 10.6 billioner m²)
3. Laminar/Cirium er for dyrt å beholde

### Endringer

**1. Slett Laminar-data fra databasen (migrasjon)**
```sql
DELETE FROM notams WHERE properties->>'source' IS DISTINCT FROM 'notaminfo';
```
Fjerner alle 480 Laminar-NOTAMs i ett steg.

**2. Fjern Laminar-fallback fra `fetch-notams/index.ts`**
- Slett hele "Step 2: Fallback to Laminar" blokken (~50 linjer)
- Fjern `laminarUsed`-variabelen
- Forenkle responsen til kun RSS-kilde

**3. Begrens sirkelradius i `createCirclePolygon`**
- Sett maks radius til **25 NM** (~46 km). NOTAMs med større radius (typisk FIR-nivå NOTAMs som QRDCA, QRDTT) vises kun som center-markør, ikke som polygon
- Dette forhindrer at enkeltstående NOTAMs visuelt dekker hele landet

**4. Oppdater admin-UI tekst**
- Fjern "Laminar API brukes som fallback" fra `NotamRssFeedsSection.tsx`

### Teknisk detalj
NOTAMs med stor radius er typisk FIR-NOTAMs (Flight Information Region) som gjelder hele luftrommet — disse er ikke relevante å tegne som polygon på kartet. Ved å begrense til 25 NM vises de i stedet som en oransje markør på senterpunktet.

