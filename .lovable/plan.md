# LFV-API — vi bruker riktig endepunkt

Kort svar: **ja**. Vi kaller `https://daim.lfv.se/geoserver/wfs` med WFS 1.1.0 + GeoJSON, akkurat som spesifikasjonen på `daim.lfv.se/echarts/dronechart/API/` beskriver. Typename-ene i adapteret vårt matcher offisielle lagnavn (inkl. `mais:` og `DAIM_TOPO:` prefiks).

## Nåværende dekning (7 lag)

| LFV-lag | Kanonisk `layer_id` | Filter |
|---|---|---|
| `mais:CTR` | `ctr` | — |
| `mais:TIZ` | `ctr` | — |
| `mais:ATZ` | `restriksjonsomrader` | — |
| `mais:RSTA` | `restriksjonsomrader` | `LOWER='GND' OR 'SFC'` |
| `mais:DNGA` | `fareomrader` | `LOWER='GND' OR 'SFC'` |
| `DAIM_TOPO:RWY5K` | `rpas` | — |
| `DAIM_TOPO:HKP1K` | `rpas` | — |

## Små justeringer å vurdere (ikke kritisk)

1. **DNGA-filter.** Spec sier kun `LOWER='GND'` (ikke SFC). Vi tar SFC også — marginalt bredere enn Drönarkartan. Kan strammes inn for 1:1 paritet.
2. **Nytt lag: `DAIM_TOPO:SUP`** — tidsbegrensede AIP-supplement-restriksjoner (`FROM`/`TO` + `LOWER<=500ft`). Naturlig mappet til `restriksjonsomrader` med `valid_from`/`valid_to` satt.
3. **NOTAM-lag `dynais:NOTAM`** — hopper vi over, siden vi allerede har eget NOTAM-system (`notams`-tabellen).
4. **`mais:ARP` / `mais:HKP_ARP`** — kun punkter (flyplass-referanser), ingen soner, ingen verdi å importere.

## Anbefalt neste steg

- **A.** La adapteret stå som det er (7 lag dekker Drönarkartans hovedinnhold) og gå videre til å faktisk kjøre svensk sync (fikse trigger-migrasjonen med korrekte vault-navn `cron_shared_secret` / `service_role_key`).
- **B.** Legg til `DAIM_TOPO:SUP` og stram DNGA-filter i samme runde — ~30 linjer i adapteret, ingen skjema-endringer.

Foreslår **B** siden vi likevel gjør en full initial-backfill for SE og bør ha temporære SUP-soner med fra start. Ingen produksjons-UI berøres — data havner i `airspace_zones` bak `airspace_unified_dk_enabled`-flagget (som fortsatt er av for både DK og SE).

## Teknisk

Filer som endres:
- `supabase/functions/sync-se-drone-zones/index.ts` — legg til SUP-oppføring i `LFV_LAYERS`, håndter `FROM`/`TO` → `valid_from`/`valid_to`, `LOW_UOM`/`UP_UOM` → meter. Stram DNGA-filter til `LOWER='GND'`.
- Trigger-migrasjon: bruk `cron_shared_secret` og `service_role_key` (lowercase) fra vault, samme mønster som DK-syncen.

Ingen skjema-migrasjoner, ingen frontend-endringer, ingen påvirkning på norske brukere.
