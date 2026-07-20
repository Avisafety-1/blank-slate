## Problem

Risikovurderingen (edge function `ai-risk-assessment`) er hardkodet mot norske datakilder og "ser" ingenting utenfor Norge. Dette bekreftes av skjermbildene fra Aalborg: population = 0/km², "No 5 km zones nearby", Airspace 9.0/10 GO — mens ruten på kartet faktisk ligger inne i EKYT CTR/TIZ og i verneområder.

Konkret hva som er NO-only i dag:
- `check_mission_airspace` RPC unionerer kun: `nsm_restriction_zones`, `rpas_5km_zones`, `rpas_ctr_tiz`, `aip_restriction_zones`, `caa_drone_zones`, `naturvern_zones`, `vern_restriction_zones`, `notams`.
- Befolkningstetthet henter fra SSB WFS (Norge).
- Arealbruk henter fra Geonorge SSB Arealbruk WFS (Norge).

De unified europeiske dataene (`airspace_zones` for DK/SE/DE/FI, `dk_drone_zones`, `dk_nature_areas`, sveriges naturreservat i `airspace_zones`) brukes ikke av risikovurderingen i det hele tatt.

## Guardrails — norske brukere skal ikke merke noe

Norge er urørt hvis vi holder oss til to enkle porter, ANDed:

1. **Geografi-port**: Rutens/oppdragets centroid ligger utenfor Norge-bboksen (57.5–71.5°N, 4.0–31.5°E). Alt inne i Norge → nøyaktig samme kodebane som i dag, samme RPC, samme SSB-kall, samme scoring.
2. **Allowlist-port**: `is_unified_airspace_enabled_for_me()` returnerer true. Fra før er kun "Moderavdeling" seedet her, så ingen andre selskap får nye datakall eller ny scoring før allowlisten utvides.

Ingen endringer på `check_mission_airspace`, `nsm_*`, `rpas_*`, `caa_*`, `naturvern_*`, `vern_*`, SSB-kallene eller populationData-scoringen. Kun *tillegg* som slår inn når begge portene er åpne.

## Endringer

### 1. Ny RPC `check_mission_airspace_unified(p_lat, p_lng, p_route)`
Samme signatur og returkolonner som `check_mission_airspace`, men unionerer over de europeiske tabellene:
- `airspace_zones` filtrert på `country_code IN ('DK','SE','DE','FI')` og `is_active = true`, mappet til `z_type` fra `zone_class` (CTR/TIZ/CTA/RMZ/TMZ/ATZ/R/D/P/NATURE osv.).
- `dk_drone_zones` med `layer_id IN ('rod','orange','bla')` mappet til hhv `5KM`, `RESTRICTED`, `INFO`.
- `dk_nature_areas` mappet til `NATURVERN`.

`STABLE SECURITY DEFINER`, `statement_timeout = 8s`, GIST-indeks-vennlig ST_DWithin med 50 km buffer (2 km for natur), identisk form på output.

### 2. Edge function `ai-risk-assessment` — additiv gren
Ved siden av eksisterende steg 9:

```text
Step 9: check_mission_airspace (NO)  — UENDRET
Step 9a (ny): hvis outside_norway(centroid) OG unified_enabled_for_company →
              kall check_mission_airspace_unified, appendes til airspaceWarnings
```

`airspaceFacts`-bygger og resten av AI-prompten er allerede generisk over `airspaceWarnings`-arrayet, så CTR/TIZ/5KM/NATURVERN blir tolket riktig uten prompt-endringer.

### 3. Befolkning/arealbruk utenfor Norge
SSB WFS-kallene er hardkodet mot norske data — de returnerer tomt for DK/SE/DE/FI. I dag gir det den villedende "0 people/km²"-teksten.

Additiv fix (kun for utenfor-NO + allowlist):
- Hopp over SSB-kallene (de er meningsløse der ute).
- Sett `populationData = null` + en eksplisitt "coverage note" i `landUseData.summary`:
  *"Population and land-use data outside Norway is not yet integrated. Ground risk (iGRC) uses SORA-default population class based on drawn footprint — verify manually against local sources."*
- iGRC-utregningen faller da tilbake på karakteristisk dimensjon/hastighet uten populasjonsreduksjon, og prompten får med disclaimeren så AI ikke skriver "0 people/km²".

For Norge fjernes/endres ingenting.

### 4. Ninox/5 km-tekst
Eksisterende `airspaceFacts.requiresNinox`-logikk er norsk-spesifikk (Ninox er Luftfartstilsynets system). For utenfor-NO settes `requiresNinox = null` og teksten blir "Local coordination may be required within 5 km of airfield — verify per country" i stedet for "Ninox approval required".

## Verifisering før merge

- Kjør risikovurdering på DK-ruten fra skjermbildet (Aalborg EKYT) som Moderavdeling-bruker: skal returnere CTR/TIZ, 5 km-ring og naturområder som warnings, Airspace-score skal droppe fra 9.0 og gi CAUTION/NO-GO.
- Kjør samme risikovurdering som en *ikke*-allowlistet bruker: skal oppføre seg som i dag (ingen nye advarsler, ingen crash).
- Kjør risikovurdering på en NO-rute (f.eks. Trondheim) som Moderavdeling-bruker: `outside_norway`-porten skal stenge, output skal være bit-identisk med før endringen.

## Ikke i scope

- Utvide allowlisten. Kun Moderavdeling til testing er fortsatt regelen.
- Befolkningsdata for Europa (Eurostat/GHSL WFS-integrasjon) — dette blir egen fase når UI-testingen på Moderavdeling er verifisert.
- Endre `check_mission_airspace` (NO) eller SSB-fetch-logikken.
