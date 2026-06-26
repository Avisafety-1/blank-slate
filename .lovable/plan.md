## Problem

I rutemodus fanger 5 km-sirkelen rundt småflyplasser (Ler, etc.) museklikket og åpner popup i stedet for å legge ned et rutepunkt. Alle andre kartlag har dette fikset allerede.

## Årsak

I `src/components/OpenAIPMap.tsx` (linje 740) finnes settet `nonInteractivePanes` som tvinger `pointer-events: none` på panes i rutemodus. `atzPane` (der småflyplass-sirklene tegnes) mangler i dette settet.

Sirklene selv settes med `interactive: mode !== 'routePlanning'` ved opprettelse (`mapDataFetchers.ts`), men hvis laget ble opprettet før man entret rutemodus, beholder Leaflet-objektet sin opprinnelige `interactive: true`. Andre lag (aipPane, rpasPane, …) er beskyttet via `nonInteractivePanes`, men `atzPane` ble glemt.

## Endring

Én linje i `src/components/OpenAIPMap.tsx`:

- Legg til `'atzPane'` i `nonInteractivePanes`-settet (linje 740).

Dette gir pane'en `pointer-events: none` i rutemodus, slik at klikk går gjennom sirkelen og treffer kartet → rutepunkt legges ned. Popup fungerer fortsatt normalt i visningsmodus og i inspect-modus (siden inspect-modus håndteres separat ved at klikk på kartet ikke legger ned punkt).

## Verifisering

- I rutemodus: klikk over Ler flyplass → nytt rutepunkt legges ned, popup åpnes ikke.
- I visningsmodus: klikk på sirkelen → popup vises som før.
- I inspect-modus i rutemodus: klikk på sirkelen → ingen popup (siden pane'n er non-interactive). Hvis dette er uønsket, kan vi alternativt veksle pane-stilen basert på `routeInspectMode` — gi beskjed om dette skal håndteres også.
