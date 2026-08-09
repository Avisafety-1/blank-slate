# NOTAM vises ikke på kartet for Norge

## Hva jeg fant

Dataene er i orden — problemet ligger i kartets frontend-cache.

Verifisert i databasen nå:
- Feed «notaminfo: Norway» synket 09.08 16:43 med 236 treff, i tillegg til de tre norske RSS-feedene (71, 53, … treff), alle uten feil.
- Tabellen `notams` har 260 aktive norske rader (`country_code = NOR`), alle med geometri og koordinater.
- Kart-funksjonen `get_notams_in_bounds` returnerer 420 rader for et Norge-utsnitt, så serversiden leverer riktig.

Årsaken er cachen som ble innført for å hindre at NOTAM-flatene «blinket» ved panorering (`src/lib/viewportLayerCache.ts`). Cachen for nøkkelen `notam` lever på modulnivå og nullstilles aldri når kartet monteres på nytt:

1. Du åpner kartet → NOTAM hentes, features legges i den daværende Leaflet-laggruppen, og `cachedBounds` settes til utsnittet.
2. Du navigerer bort og tilbake (eller kartet remountes) → en ny, tom laggruppe opprettes, men cachen husker fortsatt gamle `cachedBounds` og de gamle feature-objektene.
3. `fetchNotams` ser at utsnittet allerede er «dekket» og avbryter før henting → ingenting legges i den nye laggruppen → kartet er tomt til du panorerer langt utenfor det gamle utsnittet.

Samme mekanisme gjør at nysynkede NOTAM ikke dukker opp før du panorerer ut av det cachede området.

## Løsning

1. Nullstill `notam`-cachen når kartet initialiseres og når kartet ryddes opp (unmount), slik at en ny laggruppe alltid får ferske data. Gjøres i `src/components/OpenAIPMap.tsx` ved siden av eksisterende `resetCache`-kall.
2. Gjør `fetchNotams` selvhelbredende: cachen lagrer hvilken laggruppe featurene ble tegnet i. Er laggruppen en annen enn sist (eller ikke lenger koblet til kartet), forkastes cachen og det hentes på nytt. Dette dekker alle framtidige remounts uten flere manuelle `resetCache`-kall.
3. La cachen utløpe på tid (f.eks. 5 minutter) for NOTAM, slik at en nylig synkronisering blir synlig uten at man må panorere.
4. Nullstill cachen når NOTAM-laget slås av i lagmenyen, slik at re-aktivering henter ferskt (samme mønster som CAA/DK-lagene bruker allerede).

## Teknisk

- `src/lib/viewportLayerCache.ts`: utvid `CacheEntry` med `layerRef` (WeakRef eller direkte referanse) og `fetchedAt`; ny hjelpefunksjon `isCacheValid(key, layer, maxAgeMs)`.
- `src/lib/mapDataFetchers.ts` (`fetchNotams`): bruk `isCacheValid` i stedet for kun `bboxCovered`; sett `layerRef`/`fetchedAt` etter vellykket henting.
- `src/components/OpenAIPMap.tsx`: `resetCache('notam', notamLayer)` i init-effekten og i cleanup, samt i `layerremove`-håndteringen for NOTAM-laget.

Ingen databaseendringer nødvendig.
