
## Sammenligning av de to KMZ-filene

Jeg fant en viktig ledetråd:

- `src/lib/kmzExport.ts` i kodebasen er nå oppdatert til WPML `1.0.2` med `Date.now()`-timestamps og `globalRTHHeight`.
- Men den opplastede `Avisafe_Route_v3.kmz` inneholder fortsatt:
  - `xmlns:wpml="http://www.dji.com/wpmz/1.0.6"`
  - ISO-timestamps som `2026-04-09T16:28:10.038Z`

Det betyr at filen du sammenligner fra Avisafe ikke ser ut til å være generert av den nyeste koden som ligger i repoet nå. Enten:
1. ruten ble eksportert før siste fix,
2. FH2-sending bruker fortsatt en eldre bygget frontend,
3. eller en annen eksportsti enn `src/lib/kmzExport.ts` brukes i praksis.

## Mest sannsynlig problem nå

Det er sannsynligvis to ting vi må fikse/verifisere:

1. **Sikre at FlightHub 2-dialogen faktisk bruker den nye KMZ-generatoren i preview/builden**
   - Bekrefte at `FlightHub2SendDialog.tsx -> generateDJIKMZ(...)` er koden som faktisk kjører
   - Verifisere at siste build er ute og at cached frontend ikke bruker gammel bundle

2. **Sammenligne struktur mot FH2-filen helt ned på waypoint-nivå**
   - Pakke ut begge KMZ-filer ordentlig
   - Sammenligne `wpmz/template.kml` og `wpmz/waylines.wpml`
   - Se etter manglende felter som FH2 faktisk har, f.eks. ekstra `payloadInfo`, heading-parametre, waypoint-actioner, folder-metadata eller annen required struktur som ikke er synlig i repoet alene

## Også funnet i koden

- `FlightHub2SendDialog.tsx` bruker `generateDJIKMZ(...)` direkte, så riktig eksportsti ser ut til å være koblet opp.
- `Kart.tsx` sender nå `soraBufferCoordinates`, så buffer-sone-feilen er sannsynligvis separat fra rute-synlighet.
- Edge-funksjonen sender fortsatt et veldig minimalt `finish-upload` body:
  ```text
  { name, object_key }
  ```
  Hvis DJI krever mer metadata for noen rutetyper/prosjekter, kan dette fortsatt være en medvirkende årsak, men siden “rute-boks” vises, peker det fortsatt sterkest mot selve WPML-innholdet.

## Plan

1. **Verifiser faktisk generert fil**
   - Reprodusere en ny Avisafe-KMZ etter siste kode
   - Bekrefte at den faktisk inneholder WPML `1.0.2` og millisekund-timestamps
   - Hvis ikke: spore caching / gammel bundle / feil eksportsti

2. **Diff mot FH2-referansefilen**
   - Pakke ut begge KMZ-filer og sammenligne `template.kml` + `waylines.wpml`
   - Identifisere nøyaktig hvilke XML-elementer FH2-filen har som Avisafe-filen mangler eller strukturerer annerledes

3. **Oppdatere `src/lib/kmzExport.ts` til å matche FH2-eksempelet enda tettere**
   - Legge til eventuelle manglende mission-/folder-/placemark-felter
   - Justere rekkefølge og schema der FH2 er streng

4. **Verifisere runtime-feilen på `/kart`**
   - Det finnes også en separat runtime-feil i kartet:
     `TypeError: undefined is not an object (evaluating 'this.getPane().appendChild')`
   - Den bør fikses samtidig fordi den kan påvirke kartlag/rendering og gjøre FH2-testing mindre pålitelig

## Filer som sannsynligvis må endres
- `src/lib/kmzExport.ts`
- eventuelt `src/components/FlightHub2SendDialog.tsx`
- eventuelt kartrelatert fil etter reproduksjon av runtime-feilen på `/kart`

## Teknisk detalj
Det viktigste funnet er dette:

```text
Repo-kode:
- wpml 1.0.2
- timestamp = Date.now()

Opplastet Avisafe_Route_v3.kmz:
- wpml 1.0.6
- timestamp = ISO string

Konklusjon:
Den sammenlignede Avisafe-filen er ikke generert fra den nyeste koden slik repoet ser ut nå.
```
