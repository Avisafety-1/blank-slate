## Mål
Gjøre «Søk dispensasjon»-lenken i naturvern-popup mer presis basert på `forvaltningsmyndighet` og `forvaltningsmyndighetType` som allerede ligger i `naturvern_zones.properties`.

## Ingen databaseendringer
Alt i forrige runde var frontend. Også denne endringen blir kun frontend — `forvaltningsmyndighet` og `forvaltningsmyndighetType` ligger allerede i JSONB-en.

## Strategi for presis lenke

I `src/lib/natureProtectionRules.ts`, utvid `enrichNatureArea` til å returnere en mer spesifikk `dispensationUrl` ut fra `forvaltningsmyndighetType`:

1. **Statsforvalter** → map navnet til fylkes-slug på `statsforvalteren.no/<slug>/miljo-og-klima/verneomrader/dispensasjon-fra-vernebestemmelser/`. Eksempler:
   - "Statsforvalteren i Rogaland" → `rogaland`
   - "Statsforvalteren i Nordland" → `nordland`
   - "Statsforvalteren i Østfold, Buskerud, Oslo og Akershus" → `ostfold-buskerud-oslo-og-akershus`
   - "Statsforvalteren i Troms og Finnmark" → `troms-finnmark` osv.
   Vi vedlikeholder en hardkodet mapping for alle 10 embeter (kort, statisk liste).

2. **Verneomraadestyre / Nasjonalparkstyre** → bygg slug fra navnet og pek til `nasjonalparkstyre.no/<slug>/` (forvaltningsmyndigheten har egen styreside der). Eksempel: "Verneområdestyret for Skardsfjella og Hyllingsdalen" → `skardsfjella-og-hyllingsdalen`. Vi normaliserer (lowercase, fjern "Verneområdestyret for"/"Nasjonalparkstyret for", erstatt æøå, mellomrom → bindestrek). Hvis slug ikke kan utledes trygt, fall tilbake til søk: `https://www.nasjonalparkstyre.no/sok/?q=<navn>`.

3. **Kommune** → `https://www.<kommune>.kommune.no/` er upålitelig. I stedet pek til Miljødirektoratets innsynsside for vernet natur + en søkelenke. Konkret: lenk til `https://faktaark.naturbase.no/?id=<naturvernId>` (Faktaark har kontaktinfo for forvalter) og vis teksten «Kontakt {kommunenavn} kommune» — knappen bruker Naturbase-faktaark som primær lenke når forvaltningsmyndighet er kommune.

4. **Sysselmesteren (Svalbard)** → `https://www.sysselmesteren.no/miljovern/verneomrader/`.

5. **Ukjent/manglende** → fall tilbake til dagens generiske `https://www.statsforvalteren.no/`.

## Implementasjon

Kun én fil endres: `src/lib/natureProtectionRules.ts`.

- Legg til konstant `STATSFORVALTER_SLUGS: Record<string,string>` med de 10 embetene.
- Legg til hjelper `slugifyNorwegian(name)` (æ→a, ø→o, å→a, lowercase, ikke-alfanumerisk → `-`).
- Utvid `enrichNatureArea` slik at `dispensationUrl` og `dispensationLabel` settes ut fra `forvaltningsmyndighetType` + `forvaltningsmyndighet`.
- `mapDataFetchers.ts` trenger ingen endring siden den allerede bruker `dispensationUrl`/`dispensationLabel` fra enrich-resultatet (knappetekst kan bli f.eks. «Søk dispensasjon hos Statsforvalteren i Rogaland»).

## Verifisering
- Klikk på et naturreservat under Statsforvalteren i Rogaland → lenke peker til rogaland-siden.
- Klikk på et område under et verneområdestyre → lenke peker til riktig styreside på nasjonalparkstyre.no.
- Klikk på et kommunalt forvaltet område → lenke åpner Naturbase-faktaark.
