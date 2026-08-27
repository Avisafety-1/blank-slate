# Fiks krasj i utstyrslista i «Avslutt flytur»

## Hva som skjer

Feilen «Maximum update depth exceeded» kommer nå fra utstyrsvelgeren i «Avslutt flytur»-dialogen, ikke fra drone-/pilot-nedtrekksmenyene (de er allerede rettet).

Feilsporet viser at løkken oppstår under av-/påkobling av elementer i en Radix-«Presence»-komponent — altså en meny som måler seg selv og posisjonerer seg om og om igjen.

## Sannsynlig årsak

For å få scrolling til å fungere på mobil ble utstyrslista tidligere satt til å rendres inne i dialogen i stedet for i en egen overlay (`portalled={false}` i `LogFlightTimeDialog.tsx`, linje 1234–1238). Da blir menyen en del av dialogens vanlige innhold samtidig som den fortsatt bruker flytende posisjonering med bredde bundet til knappen (`w-[--radix-popover-trigger-width]`).

Det gir en selvforsterkende sløyfe: menyen tar plass i layouten → knappen flytter seg → menyen måler og reposisjonerer → layouten endres igjen. Når du huker av/på et utstyr endres høyden, og løkken går til React stopper den med feilskjermen.

Denne diagnosen er basert på kodelesing av feilsporet og komponenten; den bekreftes i verifiseringssteget under.

## Endring

`src/components/LogFlightTimeDialog.tsx` — bytt ut popover-menyen for utstyr med en enkel utvidbar seksjon rett i skjemaet:

- Knappen «Velg utstyr / N valgt» blir en vanlig toggle-knapp som viser/skjuler lista under seg.
- Lista rendres som et vanlig panel i dialogen, med egen høydebegrensning og scroll (`max-h`, `overflow-y-auto`, `overscroll-contain`, `touch-action: pan-y`, iOS-momentum). Ingen flytende posisjonering, ingen portal, ingen måling av trigger-bredde — dermed ingen posisjoneringsløkke.
- Avkryssing/fjerning av utstyr fungerer som i dag (samme `toggleEquipment`).
- Utseendet holdes likt dagens meny (samme kantlinje, bakgrunn, radhøyde og hover), så det oppleves som før.

`src/components/ui/popover.tsx`: `portalled`-propen beholdes (den er ufarlig og kan brukes andre steder), men brukes ikke lenger her.

Ingen endringer i lagringslogikk, flytimer, drone-/pilotvalg eller andre dialoger.

## Verifisering

Åpne «Avslutt flytur», åpne utstyrslista, scroll i den på mobil, huk av og fjern flere utstyr etter hverandre, og bekreft at ingen feilskjerm dukker opp og at valgt antall stemmer ved lagring.

## i18n

Ingen nye tekster; eksisterende nøkler (`logFlight.selectEquipment`, `logFlight.equipmentSelectedCount`, `logFlight.noEquipmentAvailable`) gjenbrukes.
