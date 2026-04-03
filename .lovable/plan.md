

## Fix: NOTAM-laget blinker ved kartbevegelse

### Problem
NOTAMs hentes på nytt fra databasen ved **hvert** `moveend`-event, og `layer.clearLayers()` kjøres før nye data tegnes. Dette gir et synlig blink. Andre luftromslag (NSM, RPAS, AIP) hentes én gang ved oppstart og ligger fast.

### Løsning
Endre NOTAM-laget til å fungere som de andre lagene: **hent alle aktive NOTAMs én gang** ved oppstart (uten bounds-filter), og fjern `moveend`-lytteren. NOTAMs synkroniseres allerede daglig til databasen, så det er ingen grunn til å re-fetche ved kartbevegelse.

### Endringer

**1. `src/lib/mapDataFetchers.ts`**
- Endre `fetchNotamsInBounds` til `fetchNotams` — fjern bounds-parametrene og bounds-filteret i Supabase-spørringen (behold bare tidsfilter for aktive NOTAMs)
- Fjern `zoom < 6` early return (vises alltid)
- Behold popup-sjekk og alt annet renderings-logikk

**2. `src/components/OpenAIPMap.tsx`**
- Flytt NOTAM-fetch til initial-fetch-blokken (sammen med NSM, RPAS, AIP)
- Fjern hele `moveend`-lytteren og debounce-timer for NOTAM
- Oppdater funksjonskallet til den nye signaturen (uten bounds/zoom)

### Resultat
NOTAM-laget tegnes én gang og forblir stabilt ved panorering/zoom — ingen blinking, ingen unødvendige database-kall.

### Filer som endres
- `src/lib/mapDataFetchers.ts`
- `src/components/OpenAIPMap.tsx`

