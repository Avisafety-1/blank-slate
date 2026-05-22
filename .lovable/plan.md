
# Plan: 5 km småflyplass-soner med PPR-varsel

Småflyplassene som vises på kartet i dag er **ATZ-soner** (Aerodrome Traffic Zone) fra OpenAIP — f.eks. Eggemoen, Gauldal, Gvarv, Starmoen. I dag tegnes de som blå OpenAIP-polygoner og inngår **ikke** i `check_mission_airspace`-RPC-en (kun de offisielle Avinor-aerodromene i `rpas_5km_zones` gjør det).

Vi skal gjøre småflyplassene til 5 km-soner — både visuelt på kartet og som luftroms­advarsel — uten å røre eksisterende 5 km-logikk for hovedflyplasser.

## Endringer

### 1. Kartlag: ATZ vises som 5 km sirkel
**Fil:** `src/lib/mapDataFetchers.ts` (ATZ-grenen rundt linje 168)

For zone_type `ATZ`: regn ut polygonets sentroide (`L.geoJSON(...).getBounds().getCenter()` eller turf), og tegn en `L.circle(center, { radius: 5000 })` i stedet for den originale polygonen. Beholder samme `rmzTmzAtzLayer`, samme pane og samme popup, men oppdaterer label til "Småflyplass — 5 km sone" og legger til linje "Kontakt flyplassen før flyging — myppr.no" i popupen.

Samme behandling i `MissionMapPreview.tsx` og `ExpandedMapDialog.tsx` hvis de gjengir ATZ separat (sjekk og oppdater hvis ja — søk på `'ATZ'`).

### 2. RPC: ny `ATZ_5KM` warning-type
**Migrasjon** som oppdaterer `check_mission_airspace`-funksjonen.

Legg til en ny `UNION ALL`-blokk i `candidate_zones`:

```sql
SELECT a.id::text, 'ATZ_5KM',
       COALESCE(a.name, a.zone_id, 'Ukjent småflyplass'),
       ST_Buffer(ST_Centroid(a.geometry)::geography, 5000)::geometry
FROM aip_restriction_zones a
WHERE a.zone_type = 'ATZ'
  AND a.geometry IS NOT NULL
  AND a.is_official = true
  AND ST_DWithin(ST_Centroid(a.geometry)::geography, v_envelope::geography, 50000)
```

I severity-CASE: `WHEN rc.cz_type = 'ATZ_5KM' THEN 'CAUTION'` (inside blir uansett oppgradert til WARNING i frontend via samme mønster som 5KM, se under).

Den eksisterende `rpas_5km_zones`-grenen for `'5KM'` røres ikke.

### 3. Frontend: warning-melding for ATZ_5KM
**Fil:** `src/components/dashboard/AirspaceWarnings.tsx`

I `normalizeWarning`: oppgrader `ATZ_5KM` med `is_inside=true` til level `warning` (samme som 5KM).

I severity-mapping i `checkAirspace`: behandle `ATZ_5KM` på samme måte som `5KM` (inside → warning, nearby → caution).

I message-genereringen, ny gren før den generiske else:
- Inside: `"Inne i 5 km-sonen rundt småflyplassen «{name}». Kontakt flyplassen før flyging — se myppr.no."`
- Nearby: `"Nærhet til 5 km-sonen rundt småflyplassen «{name}», {dist} unna. PPR (Prior Permission Required) kan kreves — se myppr.no."`

(Lenken renderes som klikkbar i Alert via en liten markup-tilpasning, eller bare som tekst hvis enklere — vi velger ren tekst for konsistens med andre meldinger.)

### 4. AI-risikovurdering
**Fil:** `supabase/functions/ai-risk-assessment/index.ts`

I airspace-fact-mappingen (rundt linje 1306): legg `ATZ_5KM` i type-normaliseringen og behandle det som egen kategori (ikke som vanlig 5KM — vi vil ikke aktivere Ninox-logikken).

I prompt-instruksjoner (rundt linje 1670–1685): legg til en regel om at `ATZ_5KM` med `inside=true` betyr "innenfor 5 km-sonen rundt en småflyplass — pilot må kontakte flyplass / sjekke myppr.no for PPR". Dette skal nevnes i `airspace.actual_conditions` og som relevant concern, men det er **ikke** automatisk HARD STOP og krever **ikke** Ninox.

Server-side override (rundt linje 2235): pass på at eksisterende "outside 5km"-overrides ikke feilaktig fjerner ATZ_5KM-omtaler.

## Tekniske detaljer

- Sentroide av en ATZ-polygon ligger normalt på selve rullebanen → 5 km sirkel rundt centroid er en god proxy for "5 km fra småflyplass".
- `is_official=false` ATZ-er (modellfly/seilfly-klubber i sync-edge-functionen, linje 47–53) ekskluderes — vi vil ikke spamme PPR-varsel for klubbflyplasser.
- Ingen endringer i `rpas_5km_zones`, ingen endringer i Ninox-flagg/sjekker, ingen endringer i `missionIn5kmZone`-blokking i `StartFlightDialog`.

## Filer som endres

1. `src/lib/mapDataFetchers.ts` — ATZ → 5 km sirkel
2. `src/components/dashboard/MissionMapPreview.tsx` + `ExpandedMapDialog.tsx` — speil endringen hvis ATZ tegnes der
3. Ny SQL-migrasjon — `check_mission_airspace` får ATZ_5KM-gren
4. `src/components/dashboard/AirspaceWarnings.tsx` — melding + farge­logikk for ATZ_5KM
5. `supabase/functions/ai-risk-assessment/index.ts` — mapping + prompt-regel for ATZ_5KM
