## Mål

Når brukeren klikker på en 5km-sone (RPAS-sone rundt en flyplass) i kartet, skal de se samme informasjon som Avinors Dronekart viser: hvordan man søker godkjenning (NINOX m.m.) og telefonnummer/kontaktdetaljer til lufthavna.

## Datakilde

Avinors offentlige ArcGIS Feature Service:

```
https://services.arcgis.com/a8CwScMFSS2ljjgn/arcgis/rest/services/Dronerestriksjonsomraader_gdb/FeatureServer/0
```

(Dette er kilden bak experience.arcgis.com-lenken brukeren delte.) Tjenesten har 101 features — én pr lufthavn — med bl.a.:

- `ICAO`, `NAVN`, `STED`, `CTR_TIZ`
- `KONTAKTDETALJER2` (norsk) + `CONTACTDETAILS2` (engelsk) — telefon og kontaktinfo
- `TEKST1`–`TEKST6` (norsk) + `TEXT1`–`TEXT6` (engelsk) — beskrivelse/godkjenningsprosess (f.eks. NINOX-stegene)

I dag bruker vi `RPAS_AVIGIS1`-tjenesten som bare har geometri + navn — derfor er popupen tom for info.

## Endringer

### 1. Bytt datakilde i `supabase/functions/sync-geo-layers/index.ts`

Endre `rpas_5km_zones`-konfigurasjonen til å hente fra `Dronerestriksjonsomraader_gdb/FeatureServer/0` i stedet for `RPAS_AVIGIS1`. Alle ekstra felter (ICAO, KONTAKTDETALJER2, TEKST1–6 osv.) lagres automatisk i den eksisterende `properties jsonb`-kolonnen — ingen DB-migrasjon nødvendig.

Kjør deretter funksjonen én gang for å fylle inn data for de 101 sonene.

### 2. Rik popup i kartet

To steder rendrer 5km-sonene med en mager popup i dag — begge oppdateres til å vise kontakt + godkjenningstekst fra `properties`:

- `src/lib/mapDataFetchers.ts` → `fetchRpasData` (hovedkartet `OpenAIPMap`). Bytter også fra direkte ArcGIS-fetch til vår egen Supabase-tabell `rpas_5km_zones` (raskere + samme kilde som synken).
- `src/components/dashboard/ExpandedMapDialog.tsx` (dashboard-kartet) — samme behandling.

Popupen får et tydelig oppsett (kompakt på mobil, scrollbar ved mye tekst):

```
Bodø lufthavn  (ENBO · CTR)
─────────────────────────────
For å fly innenfor 5 km må operatøren ta
kontakt før flygning.

Denne lufthavnen bruker NINOX DRONE.
1. Last ned NINOX-appen …
2. Opprett bruker …
Flyging og godkjennelse gis i 3 steg …

Kontakt
☎ +47 75 52 11 90
Skal kun brukes for oppstart/avslutning
eller hvis NINOX ikke fungerer.
```

Felt brukt fra `properties`: `NAVN`, `ICAO`, `CTR_TIZ`, `TEKST1`–`TEKST6`, `KONTAKTDETALJER2`. Linjeskift (`\n`, `\r\n`) konverteres til `<br/>`. HTML-escapes for å hindre XSS.

### 3. Ingenting endres i

- Logikken for varsler / safety-analyse / Ninox-blokkering (`StartFlightDialog`, `AirspaceWarnings`) — bruker fortsatt geometri og samme tabell.
- DB-skjema, RLS, edge-function-secrets.

## Verifisering

1. Kall `sync-geo-layers` med `layer=rpas_5km_zones`, sjekk at `properties->>'KONTAKTDETALJER2'` er satt for ENBO i Supabase.
2. Åpne kartet, klikk Bodø-sonen, bekreft at popup viser telefonnummer og NINOX-steg.
3. Klikk en sone uten NINOX (f.eks. en mindre lufthavn med ren `KONTAKTDETALJER`-tekst) og bekreft fallback.
