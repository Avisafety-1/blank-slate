## Problem

I `src/pages/Oppdrag.tsx` kanselleres scroll-til-oppdrag-løkken umiddelbart etter at den startes:

1. Effekten leser `state.scrollToMission` og kaller `ensureVisibleAndScroll()`.
2. Rett etterpå kalles `data.navigate(pathname, { replace: true, state: null })` for å rydde navigasjonsstaten.
3. Det endrer `data.location.state`, som er dependency på `useEffect` → React kjører cleanup på forrige effekt-kjøring → `cancelled = true`.
4. Løkken stopper før den rekker å finne kortet (eller laste neste side) → ingen scroll.

## Løsning

Flytte scroll-håndteringen ut av effektens cancel-livssyklus og bruke en `ref` som idempotent vakt, slik at:

- Vi behandler en gitt `missionId` bare én gang per navigasjon.
- Cleanup ved re-render avbryter ikke en pågående scroll.
- Navigasjonsstaten ryddes først *etter* at scroll er fullført (eller etter at maks antall forsøk er nådd), så ev. tilbakeknapp/refresh ikke gjenåpner state.

### Endringer i `src/pages/Oppdrag.tsx`

1. Legg til `const handledScrollRef = useRef<string | null>(null);`
2. I effekten:
   - Hvis `state.scrollToMission && state.missionId` og `handledScrollRef.current !== state.missionId`:
     - Sett `handledScrollRef.current = state.missionId`.
     - Kjør `ensureVisibleAndScroll()` uten å returnere cleanup som setter `cancelled`.
     - Fjern den umiddelbare `data.navigate(..., { state: null })`-kallet for scroll-grenen.
   - Når `ensureVisibleAndScroll` enten har scrollet, eller gitt opp etter 20 forsøk, kall `data.navigate(pathname, { replace: true, state: null })` der inne.
3. Behold dagens oppførsel for dialog-grenen (`routeData/formData/openDialog`) uendret.
4. Sjekk at `headerOffset()` fortsatt bruker sticky `<header>` høyde + 8px.

### Verifisering

- Åpne et oppdrag → `/kart` → trykk «Tilbake til oppdrag» → siden skal scrolle slik at oppdragstittelen ligger rett under sticky-headeren, også når oppdraget ligger lenger ned i listen og må lastes via `loadMore()`.
- Ringe-highlighten skal fortsatt vises i ~2 sekunder.
- Gjenta for et oppdrag som allerede er synlig i viewportet.