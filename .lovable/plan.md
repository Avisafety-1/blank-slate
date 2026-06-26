Plan

1. Endre scroll-håndtering i src/pages/Oppdrag.tsx
   - Erstatt dagens `el.scrollIntoView({ behavior: 'smooth', block: 'center' })` med en måling som legger oppdragskortets øvre kant rett under det sticky topphodet.
   - Mål høyden på `<header>` runtime og trekk den fra med en liten margin (ca. 8 px) slik at kortets topp kant kommer akkurat under headeren, i likhet med skjermbildet.
   - Hvis kortet ikke finnes i DOM ennå (fordi oppdraget ligger lenger nede i server-side paginering), kall `data.loadMore()` og prøv på nytt inntil elementet rendres.
   - Når elementet finnes, sørg for at lokal `visibleCount` er stor nok til å vise kortet.
   - Behold ring-animasjonen som markerer det aktive oppdraget.

2. Behold Kart.tsx uendret
   - Knappen «Tilbake til oppdrag» sender fortsatt samme navigasjonstilstand: `{ missionId: editingMissionId, scrollToMission: true }`.

3. Verifisering
   - Kjør build/typecheck.
   - Bruk Playwright for å åpne /kart fra et oppdrag, trykk «Tilbake til oppdrag», og ta screenshot for å bekrefte at tittelen på oppdragskortet ligger øverst på skjermen.