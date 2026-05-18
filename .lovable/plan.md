# Opprydding av kartlag på /kart

Lag-velgeren har i dag ~22 flate toggles med separate norske og danske varianter for samme type sone. Vi slår sammen relaterte lag under korte, allmennkjente navn, grupperer i seksjoner, og lar lands­spesifikke data kun vises når kartet er over det aktuelle landet.

## 1. Sammenslåtte toggles med korte navn

Bytter ut "(CAA)" / "🇩🇰 …" / lange tospråklige navn med ett enkelt ord folk kjenner:

| Ny toggle | Erstatter |
|---|---|
| **Restriksjonsområder** | Restriksjonsområder (CAA) + 🇩🇰 Flyvesikringskritisk (rød) |
| **Fareområder** | Fareområder (CAA) + 🇩🇰 Opmærksomhedsområder (orange) |
| **Sikringsobjekter** | Fengsler (CAA) + Ambassader (CAA) + 🇩🇰 Sikringskritisk (blå) |
| **Verneområder** | Verneområder (NO) + 🇩🇰 Naturområder |
| **Flyplasser** | Flyplasser + Mindre flyplasser (CAA) |
| **NOTAM** | Live Notam (test) + NOTAM-soner (CAA) |

Hver toggle styrer både NO- og DK-underlaget samtidig (én bryter, to underliggende `L.layerGroup`).

## 2. Land-basert auto-skjul

DK-data fetches/rendres kun når kartets `bounds` overlapper Danmark (lat 54.5–57.8, lng 8–13). Norske CAA-data fetches kun innenfor Norge. Implementeres som `isInDenmark(bounds)` / `isInNorway(bounds)` guard i `mapDataFetchers.ts` — samme viewport-mønster som allerede brukes.

Resultat: én bryter, riktig data dukker opp automatisk når man panner over grensen.

## 3. Gruppering i Sheet

`MapLayerControl.tsx` får `group?: string` på `LayerConfig` og rendrer en liten overskrift per seksjon:

- **Luftrom** — Luftrom (OpenAIP), RPAS 5 km, NSM, Fareområder (P/R/D), RMZ/TMZ/ATZ
- **Restriksjoner** — Restriksjonsområder, Fareområder, Sikringsobjekter, NOTAM
- **Natur & befolkning** — Verneområder, Befolkning, Tettsteder, Arealbruk
- **Infrastruktur** — Luftfartshindre (NRL), Hindringer, Kraftledninger, Luftnett Tensio, Flyplasser
- **Live trafikk** — Droner, Lufttrafikk, Skipstrafikk
- **Oppdrag** — Oppdrag, Utførte, Planlagte (delt)

## 4. Andre korte navn

- "Luftfartshindre (NRL)" → **Luftfartshindre**
- "Hindringer (OpenAIP)" → *(slått sammen med Luftfartshindre, samme toggle)*
- "Kraftledninger (NVE)" → **Kraftledninger**
- "Befolkning Norge (SSB)" + "Befolkning Europa (Eurostat)" → **Befolkning** *(auto-velger Norge-laget i Norge, Eurostat ellers)*
- "Skipstrafikk (NAIS)" → **Skipstrafikk**
- "Lufttrafikk (live)" → **Lufttrafikk**
- "Droner (live)" → **Droner**

## Teknisk

- `MapLayerControl.tsx`: legg til `group?: string`-felt og enkel seksjonsrendering.
- `OpenAIPMap.tsx`: én `LayerConfig` per sammenslått toggle. `onLayerToggle` mapper id → liste av underliggende `L.layerGroup`-instanser som legges til/fjernes samtidig.
- `mapDataFetchers.ts`: `isInDenmark` / `isInNorway` guards før fetch av land-spesifikke datakilder.

## Spørsmål

1. OK å bruke **Sikringsobjekter** som samlebegrep for fengsler + ambassader + DK-blå?
2. OK å slå NRL-luftfartshindre og OpenAIP-hindringer til én **Luftfartshindre**-toggle?
3. OK å slå Befolkning Norge + Europa til én auto-toggle?
