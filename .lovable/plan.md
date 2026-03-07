

## Plan: Infinite scroll med lazy-loading på /oppdrag

### Problem
Alle oppdrag hentes og rendres på en gang. Med mange oppdrag blir dette tregt — både nettverksmessig (mange relaterte queries) og renderingsmessig (hundrevis av MissionCard-komponenter).

### Løsning: Klient-side infinite scroll (virtuell paginering)

Siden data allerede hentes samlet med alle relasjoner (personnel, drones, equipment, etc.) i batch-queries, er det mest effektivt å beholde data-hentingen som den er, men **begrense rendering** til 10 kort om gangen med "last flere ved scroll".

Alternativet — server-side paginering — ville kreve omskriving av hele batch-fetch-logikken (8 parallelle queries med `.in()`) og gjøre offline-cache mer kompleks. Klient-side slicing gir 90% av gevinsten med minimal endring.

### Endringer

**`src/pages/Oppdrag.tsx`**

1. Legg til `visibleCount` state, starter på 10
2. Slice `filteredMissions` til `filteredMissions.slice(0, visibleCount)`
3. Legg til en `IntersectionObserver` på et sentinel-element i bunnen av listen
4. Når sentinel blir synlig: `setVisibleCount(prev => prev + 10)`
5. Reset `visibleCount` til 10 når `filterTab`, søk eller filtre endres
6. Vis "Laster flere..." tekst eller spinner når det finnes flere å vise

```text
[MissionCard 1]
[MissionCard 2]
...
[MissionCard 10]
[--- sentinel div (IntersectionObserver) ---]
   ↓ scroll → visibleCount += 10
[MissionCard 11-20 rendres]
```

### Ingen andre filer endres
- `useOppdragData.ts` forblir uendret — batch-fetch er effektivt og nødvendig for offline-cache
- Ingen nye avhengigheter

