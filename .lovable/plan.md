# Rikere popup-kort for unified airspace-soner

Målet er å erstatte det kodete popup-innholdet (`DRONE_NO_FLY · SE · APPROVAL_REQUIRED`, `NATURE_SENSITIVE`) med lesbar, menneskevennlig info, og hente ut mer av det som allerede ligger i `airspace_zones.properties`. Ingenting endres for norske lag eller for brukere utenfor `airspace_unified_company_allowlist` (Moderavdeling i C1).

## Hva finnes allerede i databasen

`airspace_zones` har allerede disse kolonnene per sone (bekreftet ved read):
- `name`, `short_name`, `theme` (f.eks. `Naturreservat`, `CTR`)
- `zone_type`, `restriction_type`, `display_class`, `layer_id`
- `lower_limit_m`, `upper_limit_m`, `lower_limit_raw`, `upper_limit_raw`, `altitude_reference`
- `authority`, `country_code`, `source`, `external_id`
- `valid_from`, `valid_to`
- `properties` (jsonb med kildespesifikke felt)

**LFV-soner** har i `properties`: `POSITIONINDICATOR` (ICAO), `TYPEOFAREA`, `UPPER`/`LOWER`, `WEF` (ikrafttredelse), `LOCATION`.
**Naturvårdsverket-soner** har i `properties`: `SKYDDSTYP`, `IUCNKATEGORI`, `KOMMUN`, `LAN`, `FORVALTARE`, `BESLUTSMYNDIGHET`, `AREA_HA`, `NVRID`, `URSPR_BESLUTSDATUM`.

Det betyr at det aller meste av det brukeren ser mangler i popupen finnes allerede — vi bare bruker det ikke.

## Endring 1 — Ny popup-bygger (nature-soner og luftrom)

Refaktorer `buildUnifiedZonePopup` i `src/lib/mapDataFetchers.ts` (og speile det samme popup-bygg i `src/lib/unifiedRouteProximityLayers.ts`) til å produsere ett menneskelig kort:

```
<strong>{name}</strong>            ← name (fallback: short_name → theme)
{theme} {short_name?}              ← f.eks. "Naturreservat · Örebro Län"
{plain-language restriction}       ← se mapping under
{height row}                       ← "GND – 1600 ft AMSL" (bruk _raw hvis satt, ellers _m)
{extra key facts}                  ← se per-kilde under
Kilde: {authority} · {country_code}
```

**Restriction → norsk/engelsk tekst** (i18n-nøkler under `pages.map.popups.unified.restriction.*`):
- `PROHIBITED` → "Forbudt område"
- `RESTRICTED` → "Restriksjonsområde"
- `APPROVAL_REQUIRED` → "Krever tillatelse fra flygekontroll"
- `CAUTION` → "Forsiktighet påkrevd"
- `NOTIFICATION` → "Notifikasjonspliktig"
- `NATURE_SENSITIVE` → "Naturvernområde"
- `INFO` → "Informasjon"

Slipp å vise selve enum-strengen. Vis theme i stedet for zone_type når theme finnes (theme er allerede menneskelig).

**Ekstra felt per kilde** (leses fra `properties` jsonb):

Naturvårdsverket (`source='naturvardsverket_se'`):
- `SKYDDSTYP` som undertittel (om ulik theme)
- `KOMMUN`, `LAN` → "Örebro Län · Askersund"
- `AREA_HA` → "23,7 ha"
- `IUCNKATEGORI` (kort variant, første komma-del)
- `FORVALTARE` → "Forvaltet av: …"
- `URSPR_BESLUTSDATUM` → "Vernet: 2002-09-13"
- Kildelenke: `https://skyddadnatur.naturvardsverket.se/` (deep-link per NVRID hvis mulig — se avklaring)

LFV (`source LIKE 'lfv%'`):
- `POSITIONINDICATOR` → ICAO-badge ("ESSP")
- `TYPEOFAREA` / `theme` som undertittel
- `LOWER`/`UPPER` + `altitude_reference` (menneskelig: "GND – 1600 ft AMSL")
- `WEF` → "Gjelder fra: 2026-07-09"
- Kildelenke: `https://daim.lfv.se/echarts/dronechart/`

Trafikstyrelsen (DK), Traficom (FI), DFS (DE) — vis theme + relevante properties tilsvarende. Ukjente kilder faller tilbake til grunnkortet uten ekstra-felt.

## Endring 2 — i18n

Alle nye strenger som `Kilde:`, `Forvaltet av:`, `Vernet:`, `Gjelder fra:`, restriction-labels, `ha`-suffiks osv. legges i `src/i18n/locales/no.json` og `en.json` under `pages.map.popups.unified.*`.

## Endring 3 — små renseregler

- Fjern `_raw` som "GND" allerede finnes i `lower_limit_raw` — ikke dupliser "GND m".
- Ikke vis høyderad hvis både lower og upper mangler.
- Trim `IUCNKATEGORI` slik at kun første segment ("Ia") vises som badge, fullteksten som tooltip.

## Om mer LFV-data (avklaring)

Popupene på daim.lfv.se viser lange beskrivelsestekster ("Flygning i kontrollzon HALMSTAD CTR mindre än 5 km från flygplatsens banor …"). Dette er **ikke** en del av WFS/API-en vi bruker (`daim.lfv.se/echarts/dronechart/API/`) — den serverer bare geometri + attributter (`IDNR`, `NAMEOFAREA`, `TYPEOFAREA`, `LOWER`, `UPPER`, `WEF`, `POSITIONINDICATOR`, `LOCATION`). Beskrivelsestekstene er statiske templates i frontendet på daim.lfv.se og finnes ikke som eget API-endepunkt.

Praktiske alternativer, med trade-offs:
1. **Hardkode samme templates som LFV** (per TYPEOFAREA: CTR/TIZ/RMZ/TMZ/R/D/P). Enkelt, dekker 95%, må vedlikeholdes.
2. **Lenke ut til daim.lfv.se** for full offisiell tekst. Ingen vedlikehold, men krever ekstra klikk.
3. **Norsk AIP-stil beskrivelse i vår i18n** — vi lager våre egne konsise regler per soneklasse.

Anbefaling: (1) + (2) kombinert — kort template-tekst i popup, "Mer info" lenke til daim.lfv.se.

Naturvårdsverket har derimot mer per-område data via en separat REST-tjeneste (`skyddadnatur.naturvardsverket.se` per `NVRID` returnerer syfte, forskrifter, forvaltningsplan). Kan hentes on-demand ved klikk hvis ønskelig, men det ligger utenfor scope her — start med feltene vi allerede har i `properties`.

## Ingen risiko for eksisterende brukere

- Alle endringer er i `buildUnifiedZonePopup` / `unifiedRouteProximityLayers` som allerede er allowlist-gated (Moderavdeling).
- Ingen endringer i norske popupbyggere (`buildCaaZonePopupHtml`, `buildDkZonePopupHtml`, AIP-popupene).
- Ingen DB-endringer, ingen migrasjoner, ingen endring i sync-funksjoner.

## Filer som endres

- `src/lib/mapDataFetchers.ts` — ny `buildUnifiedZonePopup` med per-source seksjoner + restriction-mapping.
- `src/lib/unifiedRouteProximityLayers.ts` — bruk samme popup-bygg (eller kall den nye funksjonen).
- `src/i18n/locales/no.json` + `src/i18n/locales/en.json` — nye `pages.map.popups.unified.*` nøkler.

## Avklaringer før build

1. LFV-beskrivelser: skal jeg legge inn korte template-tekster per soneklasse (CTR/TIZ/RMZ/…) + lenke til daim.lfv.se, eller kun lenke?
2. Naturvårdsverket "Mer info"-lenke: skal jeg deep-linke til `https://skyddadnatur.naturvardsverket.se/?nvrid={NVRID}` (må verifiseres at URL-mønsteret er stabilt), eller bare til rot-siden?
3. Skal popupene være tospråklige (følge `i18n.language`) også for felt vi henter direkte fra kilden (SKYDDSTYP er svensk, LFV er engelsk)? Standard er å vise som-de-er fra kilden.
