

## Slå sammen naturvern og vern-restriksjoner til ett kartlag

### Problem
To separate kartlag vises i lagkontrollen, men kun det ene (vern-restriksjoner) ble synlig. Brukeren ønsker ett samlet lag kalt "Verneområder".

### Endring

**Fil: `src/components/OpenAIPMap.tsx`**

1. Fjern det separate `vernRestriksjonLayer` og dets `layerConfigs.push(...)` (linje 405-407)
2. Legg begge datasett inn i én felles `L.layerGroup` kalt `naturvernLayer`
3. Endre navn fra "Naturvernområder" til "Verneområder" (linje 403)
4. Sett `enabled: true` (siden vern-restriksjoner var enabled)
5. Oppdater begge fetch-kallene til å bruke samme `naturvernLayer`:
   - `fetchNaturvernZones({ layer: naturvernLayer, mode })` (allerede riktig)
   - `fetchVernRestrictionZones({ layer: naturvernLayer, mode })` (endre fra `vernRestriksjonLayer`)
6. Gjør det samme i refetch-blokken (linje 591-592)

### Resultat
- Én knapp i lagkontrollen: "Verneområder" med treePine-ikon
- Begge datasett (naturvernområder + ferdsels-/landingsforbud) tegnes i samme lag
- Fargekodingen skiller dem fortsatt visuelt (grønn for naturvern, rød/oransje for restriksjoner)

