## Problem

Når man kommer til `/oppdrag` via «Tilbake til oppdrag» starter scroll-løkken i `src/pages/Oppdrag.tsx` (linje ~143) før initial-fetchen er ferdig. Det fører til:

1. `filteredMissions` er tom → koden hopper rett til `data.loadMore()` selv om initial-fetchen pågår. Dette starter en *ekstra* `fetchMissionsForTab(..., append=true)` (10+ DB-spørringer) parallelt med initial-lasten.
2. Hvis oppdraget ikke ligger i synlig tab, lastes side etter side til løkken gir opp — fortsatt uten å finne det.
3. Polleren respekterer ikke `data.isLoading` (kun `isLoadingMore`), så loadMore-kall kan stables.
4. Stort `setVisibleCount` kan tvinge mange `MissionCard` å rendres på én gang.

Resultat: lang spinner og høy DB-last for noe som egentlig bare skulle scrolle.

## Løsning

Send nok kontekst fra `/kart` til at `/oppdrag` vet hvilken tab oppdraget hører til, og la scroll-løkken vente på første render-pass før den eventuelt eskalerer.

### Endringer

**`src/pages/Kart.tsx`** (linje ~1104, «Tilbake til oppdrag»-knappen)
- Når man navigerer tilbake, ta med `missionStatus` fra `editingMission` i state, slik:
  `navigate('/oppdrag', { state: { missionId, scrollToMission: true, missionStatus: editingMission?.status } })`.

**`src/pages/Oppdrag.tsx`** (scroll-grenen i `useEffect`)
- Hvis `state.missionStatus` indikerer Fullført/Avbrutt og `data.filterTab !== 'completed'`, sett `data.setFilterTab('completed')` før loop starter (og vice versa). Dette unngår å lete i feil tab.
- Vent på at `data.isLoading === false` før første reelle lookup. Implementeres ved at `ensureVisibleAndScroll` ser på `data.isLoading` (via ref/closure) og bare re-poller hvis lasting pågår — uten å kalle `loadMore()`.
- Kall `data.loadMore()` kun når:
  - initial-load er ferdig (`!data.isLoading`), 
  - `data.hasMoreData === true`, 
  - `data.isLoadingMore === false`, 
  - og oppdraget ikke ligger i den allerede lastede listen.
- Maks 2 `loadMore()`-kall totalt før vi gir opp (og viser en kort `toast.info("Fant ikke oppdraget i listen")`). Hindrer endeløs paginering.
- Behold `setVisibleCount(index + 1)`, men sjekk først at index > visibleCount slik at vi ikke trigger unødvendige re-renders.
- Behold `handledScrollRef` så håndteringen er idempotent.

### Verifisering

- Klikk «Tilbake til oppdrag» fra et **aktivt** oppdrag som er øverst i listen → /oppdrag åpnes, spinneren forsvinner like raskt som ved direkte navigasjon, og siden scroller til kortet.
- Gjør samme for et **aktivt** oppdrag som ligger lenger ned (kreves `loadMore` én gang).
- Gjør samme for et **fullført** oppdrag → tab byttes automatisk til Fullført før scroll.
- Sjekk network-fanen: ingen dupliserte page-0-fetcher mot `missions`.