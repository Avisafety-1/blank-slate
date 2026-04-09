
Mest sannsynlig ja: vi bør knytte en faktisk drone/enhet til FH2-ruten, eller i det minste la brukeren velge hvilken DJI-modell ruten er laget for.

Hva jeg fant i koden:
- `FlightHub2SendDialog.tsx` sender bare `{ action, projectUuid, kmzBase64, routeName }`.
- `flighthub2-proxy` sender bare `name` og `object_key` til `finish-upload`.
- `kmzExport.ts` hardkoder `droneEnumValue=68` / `droneSubEnumValue=0`.
- På `/kart` finnes allerede dronevalg via `SoraSettingsPanel`, men dette brukes ikke i FH2-dialogen.
- DJI-dokumentasjonen viser egne API-er for:
  - liste enheter i organisasjonen/prosjektet
  - hente enhetsmodell via `device_sn`
- Skjermbildet ditt viser at FH2 faktisk har en modellkobling på fungerende ruter (`Matrice 30 T`), mens Avisafe-rutene vises uten slik modelltekst. Det er en sterk indikasjon på at FH2 trenger eller forventer device/model-kontekst for full waypoint-rendering eller redigering.

Plan:
1. Koble FH2-rutesending til valgt drone fra ruteplanleggingen
   - bruke `soraDroneId` / valgt drone fra `SoraSettingsPanel`
   - sende valgt drones modell videre til FH2-dialogen og KMZ-generatoren
   - dersom ingen drone er valgt, vise tydelig advarsel eller blokkere rutesending

2. Gjøre KMZ-generatoren modellbevisst
   - utvide `DJIExportOptions` med DJI droneidentitet, ikke bare flyparametre
   - erstatte hardkodet `68/0` med verdier utledet fra valgt drone
   - legge inn en liten modellmapping for kjente DJI-modeller (f.eks. Matrice 30 / 30T / 300 RTK)
   - fallback til dagens standard hvis modellen ikke kan mappes

3. Forbedre FlightHub 2-dialogen
   - vise hvilken drone/modell ruten sendes for
   - eventuelt legge til et eksplisitt “DJI-modell”-valg dersom valgt intern drone ikke kan mappes sikkert
   - forklare kort at dette påvirker hvordan FH2 tolker og viser waypoints

4. Utvide proxyen med FH2-enhetsstøtte
   - legge til read-only action for å hente prosjektets enheter fra DJI
   - bruke den for å vise/validere hvilke enheter som finnes i valgt prosjekt
   - om nødvendig sende ekstra metadata i upload-flyten dersom FH2 krever dette i tillegg til KMZ-innholdet

5. Stramme inn sikker standard
   - standardisere konservative default-verdier for takeoff height, turn mode og height mode
   - gjøre “stopp i punkt” og “relativ til startpunkt” til trygge defaults
   - la avanserte valg være eksplisitte, ikke skjulte harde antagelser

6. Verifisering etter implementasjon
   - teste med en rute sendt med valgt DJI-modell/enhet
   - bekrefte at ruten viser waypoint-punkter i FH2, ikke bare rute-boks
   - sammenligne metadata mot fungerende FH2-rute hvis den fortsatt ikke vises riktig

Filer som mest sannsynlig må endres:
- `src/pages/Kart.tsx`
- `src/components/FlightHub2SendDialog.tsx`
- `src/lib/kmzExport.ts`
- `supabase/functions/flighthub2-proxy/index.ts`

Teknisk vurdering:
```text
Nåværende svakhet:
- Avisafe sender generell KMZ
- FH2-referansen ser ut til å være knyttet til spesifikk drone/modell
- valgt drone i ruteplanlegging brukes ikke i FH2-upload

Sannsynlig forbedring:
- velg drone i Kart/SORA
- map intern drone -> DJI modellidentitet
- skriv riktig droneInfo i WPML
- eventuelt hent/prosjektsjekk devices via FH2 API
```
