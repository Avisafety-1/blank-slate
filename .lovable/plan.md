## Mål

Når en NOTAM refererer til et kjent fareområde (f.eks. "DANGER AREA END354 LEKSDALEN" eller "END365 GISKAS"), skal vi tegne NOTAMet med den faktiske polygonen fra `caa_drone_zones` (layer_id `fareomrader`) i stedet for en sirkel rundt Q-line-senteret.

## Slik gjør vi det

**1. Match NOTAM-tekst mot CAA-fareområder**

I `supabase/functions/fetch-notams/index.ts`, etter at hver RSS-item er parset:

- Kjør regex `EN[DR]\d{3}[A-Z]?` mot `notam_text` for å finne kandidatkoder (END104, END365, END548Z, osv).
- Slå opp kodene i `caa_drone_zones` (layer_id IN ('fareomrader')). Prøv eksakt match først, deretter uten suffiksbokstav (END548Z → END548).
- Ved treff: erstatt `geometry_geojson` med polygonet fra `caa_drone_zones.geometry_geojson`, og legg på `properties.geometry_source = "caa-fareomrader"` og `properties.matched_caa_id = "END354"` så vi kan se i popup hvor geometrien kommer fra.
- Ingen treff: behold dagens oppførsel (sirkel fra Q-line, eller pin for scope A).

**2. Effektivitet**

- Last alle relevante CAA-zoner én gang per kjøring (én SELECT på starten av `Deno.serve`-handleren), bygg en `Map<external_id, geometryGeojson>` i minnet, og gjør oppslag synkront per NOTAM.

**3. Refresh av eksisterende NOTAMer**

Trigg `fetch-notams` manuelt én gang etter deploy slik at allerede lagrede NOTAMer får oppdatert geometri (upsert på `notam_id`).

## Visuell merking (lite tillegg)

I `buildNotamPopup` (`src/lib/mapDataFetchers.ts`): hvis `notam.properties.geometry_source === "caa-fareomrader"`, vis en liten linje i popupen: «Geometri: Luftfartstilsynet AIP (via CAA-fareområde {matched_caa_id})». Hjelper brukeren å forstå hvorfor området ser annerledes ut enn før.

## Hva som IKKE er med (men kan utvides senere)

- **Restriksjonsområder (ENRxxx)**: dronesoner.no har et eget lag `forbud_restriksjoner.geojson` som vi i dag _ikke_ synkroniserer. Hvis vi vil at f.eks. "RESTRICTED AREA ENR102" skal få presis geometri tilsvarende, må vi først legge til det laget i `sync-caa-drone-zones` (LAYERS-array). Si fra hvis du vil ha det med — det er en liten utvidelse.
- **Forbud_notam.geojson**: dronesoner.no har også et eget NOTAM-lag derfra. Vi kan vurdere å bytte hele NOTAM-kilden til den, men det er en større endring og vi mister da NOTAMer som ikke har droneforbud. Anbefaler å ikke gjøre det nå.

## Tekniske detaljer

- Filer: `supabase/functions/fetch-notams/index.ts` (hovedendring), `src/lib/mapDataFetchers.ts` (kun popup-tilskudd, ingen ny logikk).
- Ingen migrasjon nødvendig — vi gjenbruker eksisterende `geometry_geojson`-kolonne.
- Match-regex inkluderer `[A-Z]?` for suffiksvarianter (END548Z), og fallback uten suffiks gjør oppslaget tolerant.
- Database-call: én `select external_id, geometry_geojson from caa_drone_zones where layer_id = 'fareomrader'` per kjøring (~47 rader, neglisjerbar).
