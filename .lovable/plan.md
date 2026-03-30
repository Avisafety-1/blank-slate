

## Legg til NAIS kartlag (båttrafikk fra BarentsWatch)

### Oversikt
Legge til et nytt kartlag som viser live skipstrafikk (AIS-data) fra BarentsWatch/Kystverket. Skipene vises som markører på kartet med popup-info (navn, type, hastighet, kurs).

### Arkitektur
BarentsWatch AIS API krever OAuth2 (client_id + client_secret). Vi trenger:

1. **Edge function** (`barentswatch-ais`) som håndterer token-henting og proxyer forespørsler
2. **Client-side fetcher** i `mapDataFetchers.ts` som henter skip innenfor kartets bounding box
3. **Kartlag** i `OpenAIPMap.tsx` som fungerer likt kraftledninger-laget (hent ved aktivering, oppdater ved panorering)

### API-flyt

```text
Bruker aktiverer lag → fetchAisInBounds(bounds)
  → supabase.functions.invoke('barentswatch-ais', { body: { bounds } })
    → Edge function henter OAuth token fra id.barentswatch.no
    → POST /v1/latest/combined med bbox-filter
    → Returnerer skip-posisjoner
  → Vis som markører på kartet
```

### Endringer

#### 1. Secrets
To hemmeligheter trengs: `BARENTSWATCH_CLIENT_ID` og `BARENTSWATCH_CLIENT_SECRET`. Bruker må registrere en API-klient på barentswatch.no/minside.

#### 2. `supabase/functions/barentswatch-ais/index.ts` (ny)
- Henter OAuth2 token fra `https://id.barentswatch.no/connect/token` med scope `ais`
- Cacher token i minnet (gyldig typisk 1 time)
- Mottar bounding box fra klient
- Kaller `POST https://live.ais.barentswatch.no/live/v1/latest/combined` med geografisk filter
- Returnerer array med skip (mmsi, name, shipType, lat, lon, sog, cog, heading, destination)

#### 3. `src/lib/mapDataFetchers.ts`
Ny funksjon `fetchAisVesselsInBounds`:
- Tar layer, bounds, zoom, pane, mode som input
- Kaller edge function med bbox
- Rendrer skip som roterte markører (SVG skip-ikon) med popup
- Skip-ikon roteres basert på `cog` (course over ground)
- Popup viser: skipsnavn, MMSI, type, hastighet (knop), kurs, destinasjon

#### 4. `src/components/OpenAIPMap.tsx`
- Nytt kartlag `nais` med skip-ikon, disabled by default
- Ved aktivering: hent data for nåværende bounds
- Ved `moveend`: re-hent data (med debounce, kun zoom ≥ 8)
- Ved deaktivering: fjern markører og stopp lytter

### Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| Secrets | `BARENTSWATCH_CLIENT_ID`, `BARENTSWATCH_CLIENT_SECRET` |
| `supabase/functions/barentswatch-ais/index.ts` | Ny edge function |
| `src/lib/mapDataFetchers.ts` | Ny `fetchAisVesselsInBounds` funksjon |
| `src/components/OpenAIPMap.tsx` | Nytt kartlag + toggle-logikk |

