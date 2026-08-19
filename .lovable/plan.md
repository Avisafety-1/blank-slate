# Hvorfor «Treningsflyving» får 5024 personer/km²

## Bekreftet årsak

Jeg hentet oppdragets rute (6 punkter, Utleirvegen 99 i Trondheim) og de samme SSB 250 m-rutene som AI-analysen bruker, og regnet etter:

- SORA-fotavtrykket for oppdraget er 30 m (flight geography) + 77,4 m (contingency) + 76 m (ground risk buffer) = **183 m** fra ruten.
- Den dimensjonerende SSB-ruten med 314 personer (314 × 16 = **5024/km²**) har senter **331 m** fra ruten — altså godt utenfor fotavtrykket.
- Innenfor det faktiske fotavtrykket er største rute **3 personer = 48/km²** (nest størst 2 personer). Det stemmer med kartet, som viser pådriver 80/km².

To feil i `computeSsb250PopulationDensity` i `supabase/functions/ai-risk-assessment/index.ts` skaper avviket:

1. Bufferen har et gulv på 250 m (`Math.max(fg + contingency + grb, 250)`), selv når det reelle fotavtrykket er 183 m.
2. Utvalget legger på ytterligere 180 m slack og måler til **rutens senterpunkt**: `distanceToSegmentMeters(...) <= footprintBufferM + 180`. Resultatet ble en søkeradius på 430 m, som trekker inn boligblokkene vest for ruten.

I tillegg regnes snittet (971/km²) over de samme for vide cellene, og kartets pådriver bruker en annen (korrekt) metode — polygon-overlapp mot faktisk bufferpolygon i `src/lib/adjacentAreaCalculator.ts`. Derfor spriker kart (80/km²) og AI (5024/km²).

## Foreslått løsning

1. Fjern 250 m-gulvet: bruk det faktiske fotavtrykket (fg + contingency + ground risk buffer), med et lavt sikkerhetsgulv kun når SORA-verdier mangler.
2. Bytt utvalgskriteriet fra «senter innenfor buffer + 180 m» til **geometrisk overlapp mellom SSB-cellepolygonet og bufferen** — samme regel som kartet bruker. Da samsvarer AI-tallet med pådriveren som vises i kartet.
3. La `maxDensity` og `avgDensity` regnes kun fra de overlappende cellene etter ny regel, og ta med cellens avstand/kilde i `calculation`-teksten så det er sporbart.
4. Etter endringen bør risikovurderingen for dette oppdraget kjøres på nytt; HARD STOP mot selskapets grense på 500/km² vil da ikke lenger utløses av befolkningstetthet (48/km² i fotavtrykket). Hard stop for pilotinaktivitet (111 dager) består.

## Teknisk

- Fil: `supabase/functions/ai-risk-assessment/index.ts`, funksjonen `computeSsb250PopulationDensity` (linje ~397-472) og bufferberegningen i seksjon 9c (linje ~1445-1460). Samme justering gjøres i Eurostat-varianten for oppdrag utenfor Norge, slik at metodene er like.
- SSB GML parses allerede med `posList`; vi beholder polygonringen i stedet for bare sentroiden, og gjenbruker overlapp-logikken (punkt-i-polygon / cellehjørne innenfor buffer) tilsvarende `cellTouchesMultiPolygon` i `src/lib/adjacentAreaCalculator.ts`.
- Ingen databaseendringer.

## Spørsmål

Skal jeg beholde en liten margin (f.eks. 25 m) rundt bufferen for å være konservativ, eller bruke fotavtrykket helt eksakt slik kartet gjør?
