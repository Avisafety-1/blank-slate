Plan for å gjøre kraftledningslag klikkbart

Målet er at brukeren kan trykke på kraftledningene i kartet og få opp tilgjengelig informasjon om linjen/objektet. NVE-laget har allerede delvis popup-støtte fordi det hentes som vektordata. Tensio-laget er WMS-bilder, så der må vi bruke WMS GetFeatureInfo ved klikk.

Endringer som foreslås:

1. Beholde NVE som klikkbart vektorlag
- Kontrollere og eventuelt forbedre eksisterende popup for `Kraftledninger (NVE)`.
- Vise mer robust info fra feltene som finnes, for eksempel navn, eier, spenning, nettnivå/type og andre relevante felt dersom de finnes.
- Fortsatt deaktivere interaktivitet i ruteplanlegging der kartklikk brukes til å tegne rute.

2. Legge til klikkstøtte for `Luftnett Tensio`
- Siden Tensio-laget er et WMS-bildelag, legger vi på en kartklikk-handler når laget er aktivt.
- Ved klikk sendes en `GetFeatureInfo`-forespørsel til:
  `https://tensio-prod-k8s10.cloudgis.no/arcgis/services/luftnett/luftnett/MapServer/WMSServer`
- Tjenesten støtter `GetFeatureInfo` og layerne `0-9` er `queryable`, så dette skal kunne gi objektinformasjon tilbake.
- Bruke `INFO_FORMAT=application/geo+json` først, med fallback til `text/html` eller `text/plain` hvis nødvendig.

3. Vise popup på kartet
- Når Tensio returnerer treff, åpnes en Leaflet-popup på klikkpunktet.
- Popupen får tittel som f.eks. `Luftnett Tensio` og viser felter fra objektet i en ryddig tabell/listing.
- Skjule tekniske/tomme felt der det er mulig, og begrense antall felt slik at popupen fungerer på mobil.
- Hvis det ikke finnes treff på klikkpunktet, vises ingen popup, slik at kartet ikke blir forstyrrende.

4. Respektere tilgang og standardvalg
- Tensio GetFeatureInfo aktiveres kun når brukeren er i Tensio-hierarkiet og `Luftnett Tensio`-laget finnes.
- Den følger samme av/på-status som laget i kartlagsmenyen.
- NVE forblir default av for Tensio, default uendret for andre, slik det ble implementert tidligere.

5. Ruteplanlegging og kartinteraksjon
- I `routePlanning`-modus skal kraftledningsklikk ikke hindre plassering av rutepunkter.
- Derfor deaktiveres popup/GetFeatureInfo i ruteplanlegging, eller ignoreres når modus er `routePlanning`.

Tekniske detaljer

- Hovedfil: `src/components/OpenAIPMap.tsx`
  - Legge til refs for Tensio-lagets enabled-status og eventuelt WMS-lag-instans.
  - Legge til `map.on('click', handleTensioFeatureInfoClick)` og rydde opp i cleanup.
  - Beregne WMS 1.3.0 GetFeatureInfo-parametre fra kartets bounds, størrelse og klikkpunkt.
  - For EPSG:4326 i WMS 1.3.0 brukes korrekt BBOX-akseorden dersom tjenesten krever det.

- Støttefunksjon kan legges i samme fil eller i `src/lib/mapDataFetchers.ts`:
  - `buildWmsGetFeatureInfoUrl(...)`
  - `formatFeatureInfoPopup(...)`
  - `sanitizePopupValue(...)`

- Eksisterende NVE-funksjon i `src/lib/mapDataFetchers.ts` kan utvides for bedre popup-format og feltvisning.

Forventet resultat

- Tensio-brukere kan slå på/ha på `Luftnett Tensio`, klikke på en ledning og få mer informasjon.
- Andre selskaper ser ikke Tensio-laget og får ingen Tensio-spørringer.
- NVE-laget er fortsatt klikkbart når det slås på, med forbedret popup der data finnes.
- Ruteplanlegging påvirkes ikke av klikkbare kartlag.