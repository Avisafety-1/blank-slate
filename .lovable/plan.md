

## Korriger Birdstrike-felt: Bird Size → Attributt 648

### Problem
Felt 67 (Bird Size) bruker feil attributt-ID. Korrekt ID ifølge ECCAIRS-taksonomien er **648** med value list VL648. Entiteten er **Aircraft (Entity 4)**, ikke Entity 7.

Samtidig korrigerer vi de andre birdstrike-feltene som allerede er bekreftet feil (fra forrige godkjente plan som ikke ble implementert):
- 65 → **646** (Birds/wildlife seen, Entity 4)
- 66 → **647** (Birds/wildlife struck, Entity 4)
- 67 → **648** (Bird size, Entity 4, VL648)
- 92 → **649** (Pilot advised of birds, Entity 4)
- 68 (Species) — fjernes inntil korrekt ID bekreftes

### Endringer

**`src/config/eccairsFields.ts`**
- 65 → 646, label «Birds/wildlife seen», entityPath `'4'`, VL646
- 66 → 647, label «Birds/wildlife struck», entityPath `'4'`, VL647
- 67 → 648, label «Bird size», entityPath `'4'`, VL648
- 68 → fjernes (art-ID ikke bekreftet)
- 92 → 649, label «Pilot advised of birds», entityPath `'4'`, VL649

**`supabase/functions/_shared/eccairsPayload.js`**
- Fjern ENTITY_PATH_OVERRIDES for 65, 66, 67, 68, 92 (Entity 7)
- Legg til overrides for 646, 647, 648, 649 → Entity 4

