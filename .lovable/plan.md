# Polen (PL) – MVP med opplastet PansaUTM KML

## Hva filen inneholder (verifisert)

- 2 738 Placemarks, alle Polygon
- Restriksjoner: `DRA-P` (177), `DRA-R` (877), `DRA-I` (140), `N/A` (1 544 – hovedsakelig underliggende ATZ/CTR/RMZ/TSA/TRA/MRT/R/D/ADIZ)
- Typer: `CTR`, `ATZ` (+ `ATZ1KM`/`ATZ6KM`), `MCTR`, `RMZ`, `TSA`, `TRA`, `MRT`, `R`, `D`, `ADIZ`, `RPA`, `AREA`, `NW`, `DRAP`/`DRAR`/`DRAI`
- Hver `<description>` har `Restriction: X, Type: Y, Min: N ft, Max: M ft`
- Navn = ICAO/zone-kode (f.eks. `EPTS7C`)

Perfekt strukturert for direkte innlasting i `airspace_zones`.

## Kan vi bruke det – vurdering

**Ja, som første MVP-kilde bak feature-flag for Moderavdeling.**

- **Innhold**: dekker alle drone-relevante lag PANSA DroneMap viser i UI.
- **Ferskhet**: statisk snapshot (25.07.2026). AUP/UUP-aktiveringer og NOTAM-driven status er ikke med — men det er samme begrensning som dagens DK/SE/FI-adaptere har for statiske soner.
- **Lisens**: KML er eksportert fra offentlig DroneMap-UI. Uklart om det er formelt lisensiert for videredistribusjon. Vi bruker det kun for allowlisted Moderavdeling til vi har avklart lisens eller PANSA-partner-API.
- **Stabile IDer**: navn (EPTS-kode) + type + restriksjon er stabilt nok som `source_ref` for idempotent upsert.

## Plan

### Fase P1 – Engangs backfill fra opplastet KML (denne uken)
1. Parser-skript (Deno one-shot i Edge Function `backfill-poland-kml`) som leser KML fra Storage (jeg laster filen opp til en privat bucket) og upserter til `airspace_zones` med:
   - `country_code='PL'`, `source='pansa_kml_snapshot'`, `source_ref` = ICAO-kode + type
   - `zone_type` normalisert til unified enum (CTR/ATZ/RMZ/TSA/TRA/MRT/R/D/ADIZ/DRONE_RED/DRONE_ORANGE/DRONE_YELLOW)
   - `restriction_type` avledet: DRA-P→`prohibited`, DRA-R→`restricted`, DRA-I→`notification`, N/A→`info`
   - `lower_limit_m`/`upper_limit_m` fra ft→m
   - `snapshot_date` = 2026-07-25 (nytt kolonnefelt for revisjon)
2. Verifisering: `airspace_shadow_comparisons` behøves ikke (ingen legacy PL-tabell) — i stedet manuell count-per-type-sanity mot DroneMap.

### Fase P2 – UI-wiring (samme uke, kun Moderavdeling)
1. Legg til `"PL"` i `UnifiedCountry`-typen og `COUNTRY_BOUNDS` i `src/lib/airspaceUnified.ts` (bbox ca. 14–24 Ø, 49–55 N).
2. `getUnifiedCountriesForRoute` inkluderer PL automatisk.
3. `src/lib/unifiedZonePopup.ts` — legg til PL-spesifikke etiketter for DRA-P/R/I på no/en.
4. `updateUnifiedRouteProximityLayers` fungerer uendret (land-agnostisk).
5. NO forblir eksplisitt blokkert i `fetchUnifiedZonesForRoute`.

### Fase P3 – AI-risikovurdering
Ingen kodeendring — `check_mission_airspace_unified` er land-agnostisk. Eurostat-befolkning dekker allerede PL. Verifiseres i Moderavdeling med testrute.

### Fase P4 – Verneområder + hindringer + NOTAM (senere separat plan)
Ikke i denne runden. Krever egne kilder (GDOŚ WFS, PANSA eTOD AIXM, PANSA NOF).

## Åpne spørsmål

1. **Skal jeg kjøre P1+P2 nå** med opplastet KML som eneste PL-kilde inntil videre?
2. **Refresh-strategi**: er det OK at PL kun oppdateres når du laster opp en ny KML manuelt (til vi eventuelt får tilgang til DroneMap API/AIP AIXM), eller vil du at jeg parallelt reverse-engineerer DroneMap-nettverkskallene for automatisk daglig sync?
3. **Verneområder i PL** – ønsket i samme runde eller i egen leveranse etter P1–P3 er verifisert?

## Risiko / garantier

- Alle skriv har `country_code='PL'` — norske rader røres ikke.
- `is_unified_airspace_enabled_for_me()` + allowlist gjør at kun Moderavdeling ser PL i UI.
- Backfill kan når som helst rulles tilbake med `DELETE FROM airspace_zones WHERE source='pansa_kml_snapshot'`.