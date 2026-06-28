## Problem
Naturvernpopupen i ruteplanleggerens auto-avslørte lag (`src/lib/routeProximityLayers.ts` → `renderNaturvern`) viser fortsatt den gamle, enkle boksen ("🌿 Naturvernområde + verneform"). Den nye, rike faktaboksen ligger inline i `src/lib/mapDataFetchers.ts` (fetchNaturvernZones).

## Løsning
1. **Trekk ut popup-bygger** til en delt helper i `src/lib/natureProtectionRules.ts`:
   - Ny eksport `buildNatureZonePopupHtml({ name, verneform, properties })` som returnerer samme HTML som dagens inline-bygger i `mapDataFetchers.ts` (statusbadge, pilotAdvice, hjemmel, metadata, faktaark/dispensasjon/sikker melding/Miljødirektoratet-knapper).
2. **Bruk helperen begge steder**:
   - `src/lib/mapDataFetchers.ts`: erstatt inline popup-bygging (linje ~960-1014) med kall til `buildNatureZonePopupHtml`. Beholder `attachHoverPromotion` og stil.
   - `src/lib/routeProximityLayers.ts` `renderNaturvern`: bytt enkel popup med `buildNatureZonePopupHtml(zone)` slik at auto-revealed naturvernpolygoner får samme faktaboks. Behold `AUTO_BADGE`-indikator ved å legge den inn enten via en `extraFooter`-parameter eller append etter.

## Detaljer
- Helperen tar et valgfritt `autoBadgeHtml`-argument slik at vi beholder "Auto-vist"-merket i ruteplanlegger-modus.
- Ingen DB-/edge-endringer. Kun frontend.
- Ingen endring i farger/stil — kun popup-innholdet.

## Filer
- `src/lib/natureProtectionRules.ts` (ny eksport)
- `src/lib/mapDataFetchers.ts` (bruk helper)
- `src/lib/routeProximityLayers.ts` (bruk helper i `renderNaturvern`)
