

# Importer nye datalag fra OpenAIP (uten duplikater)

## Maal
Utvide OpenAIP-importen til aa hente data som IKKE allerede finnes fra ArcGIS-kildene. Dette gir bedre dekning av luftrom og hindringer relevante for droneoperasjoner.

## Hva importeres (nytt)

| Datakilde | OpenAIP Type | Eksempel | Farge paa kart |
|-----------|-------------|----------|----------------|
| RMZ (Radio Mandatory Zone) | type 8 | Geiteryggen ENSG | Groenn |
| TMZ (Transponder Mandatory Zone) | type 9 | | Turkis |
| ATZ (Aerodrome Traffic Zone) | type 13 | | Lysebla |
| Hindringer (Obstacles) | eget API-endepunkt | Vindturbiner, master | Roed/oransje ikoner |

## Hva importeres IKKE (allerede fra ArcGIS)
- CTR (type 6) - har RPAS CTR/TIZ fra ArcGIS
- TMA (type 7) - dekket av eksisterende lag
- NSM-soner - egen ArcGIS-kilde
- RPAS 5km-soner - egen ArcGIS-kilde
- Flyplasser - beholder ArcGIS som primaerkilde (mer paalitelig for norske data)

## Teknisk plan

### Steg 1: Database - nye tabeller og utvidelse

**Utvid `aip_restriction_zones`-tabellen** til aa ogsaa lagre RMZ/TMZ/ATZ-soner (de bruker samme struktur med polygon-geometri).

Nye zone_type-verdier: `RMZ`, `TMZ`, `ATZ`

**Ny tabell `openaip_obstacles`**:
- id, openaip_id, name, type (mast, vindturbin, etc.)
- geometry (Point), elevation, height_agl
- properties (jsonb), synced_at

RLS: Lesbar for alle autentiserte brukere.

### Steg 2: Utvid sync-openaip-airspaces edge function

- Legg til type 8 (RMZ), 9 (TMZ), 13 (ATZ) i API-kallet
- Mappe disse til zone_type RMZ/TMZ/ATZ i typeMap
- Upsert til `aip_restriction_zones` med riktig zone_type

### Steg 3: Ny edge function for hindringer

Ny funksjon `sync-openaip-obstacles`:
- Henter fra `https://api.core.openaip.net/api/obstacles?country=NO`
- Lagrer i `openaip_obstacles`-tabellen
- Kjores daglig via cron (sammen med airspaces)

### Steg 4: Vis nye lag paa kartet (OpenAIPMap.tsx)

- Hent RMZ/TMZ/ATZ fra `aip_restriction_zones` (samme query, nye zone_type-verdier)
- Vis med egne farger og styling:
  - RMZ: groenn stiplet linje
  - TMZ: turkis stiplet linje  
  - ATZ: lysebla heltrukket linje
- Nytt kartlag for hindringer med ikoner (trekant-varsel)
- Legg til i MapLayerControl saa brukere kan sla av/paa

### Steg 5: Luftromsadvarsler for nye soner

Oppdater `check_mission_airspace`-funksjonen til aa ogsaa sjekke RMZ/TMZ/ATZ:
- RMZ/TMZ: FORSIKTIGHET-nivaa (krever radiokontakt/transponder)
- ATZ: INFORMASJON-nivaa

### Steg 6: Oppdater MissionMapPreview og ExpandedMapDialog

Vis de nye sonene ogsaa i oppdragskart-forhåndsvisningen og utvidet kartdialog.

## Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| Ny migrasjon | Ny tabell `openaip_obstacles`, utvid `check_mission_airspace` |
| `supabase/functions/sync-openaip-airspaces/index.ts` | Legg til type 8, 9, 13 |
| `supabase/functions/sync-openaip-obstacles/index.ts` | Ny edge function |
| `supabase/config.toml` | Config for ny funksjon |
| `src/components/OpenAIPMap.tsx` | Vis RMZ/TMZ/ATZ og hindringer |
| `src/components/MapLayerControl.tsx` | Nye toggle-valg |
| `src/components/dashboard/MissionMapPreview.tsx` | Vis nye soner |
| `src/components/dashboard/ExpandedMapDialog.tsx` | Vis nye soner |

