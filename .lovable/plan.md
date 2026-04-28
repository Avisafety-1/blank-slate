Jeg er enig i diagnosen: dette ser ut som en kombinasjon av to ting:

1. Hentingen er bundet til beregnet SORA/tilstøtende bbox, men dersom beregningen kjøres før/uten full tilstøtende radius eller blir avbrutt/erstattet av en mindre beregning, ender kartet med et delsett.
2. Edge function returnerer kun SSB-ruter med `pop_tot > 0`, så ubebodde ruter vil uansett ikke vises. Det kan se ut som “manglende dekning”, selv om de manglende rutene egentlig er 0-befolkning eller ikke returneres av SSB WFS.

Jeg fant også en relevant Leaflet-feil (`appendChild`) som kan oppstå når SSB-laget tegnes før pane/renderer er stabilt opprettet. Det bør fikses samtidig, fordi det kan stoppe tegning av laget.

Plan for implementering:

1. Skille “beregningsdata” fra “kartvisningsdata”
   - Beholde SORA-beregningen basert på høyeste SSB 250m-rute som berører ruten/buffersonen/tilstøtende område.
   - Lage en tydeligere kartdata-flyt som alltid henter for hele beregnet coverage polygon, ikke dagens skjermutsnitt.
   - Når “Tilstøtende” er på, skal coverage være: SORA-volum + tilstøtende radius.
   - Når kun SORA-volum er på, skal coverage være: SORA-volum.

2. Sikre at zoom/panorering ikke begrenser SSB-rutene
   - SSB 250m-rutene skal hentes fra route geometry/buffer geometry, ikke `map.getBounds()`.
   - Legge inn cache/nøkkel basert på rute + SORA-settings + tilstøtende radius, slik at zoom ut/inn ikke trigger mindre/feil datasett.
   - Ved endring av tilstøtende toggle, rute eller SORA-volum skal hele datasettet hentes på nytt.

3. Vise tydelig forskjell mellom “0 befolkning” og “ikke hentet”
   - Siden SSB WFS-resultatet filtreres på `pop_tot > 0`, er det ikke garantert at vi får polygoner for tomme celler.
   - Jeg vil legge inn en subtil dekningsoverlay over hele SORA/tilstøtende coverage-området når SSB 250m-laget er aktivt. Da ser brukeren at hele området er vurdert, mens bare ruter med befolkning tegnes som celler.
   - Pådriver-ruten får fortsatt den eneste permanente labelen.

4. Fikse Leaflet pane/renderer-feilen
   - Opprette `populationDensityPane` én gang under map-init før lag legges til.
   - Bruke et eksplisitt `L.svg({ pane: 'populationDensityPane' })` renderer for polygonene.
   - Ikke tegne SSB-celler før kartet og pane/renderer er klare.
   - Dette adresserer runtime-feilen `Cannot read properties of undefined (reading 'appendChild')`.

5. Forbedre forklaring i UI
   - I SORA-/tilstøtende-panelet legge inn kort tekst: “Kartet viser befolkede SSB 250m-ruter innenfor hele beregnet område. Områder uten ruter betyr normalt 0 registrert befolkning i SSB-rutenettet, ikke at området er utelatt.”
   - Beholde 1 km SSB-kartlaget i kartlag-menyen som før.

Tekniske filer som berøres:
- `src/pages/Kart.tsx`: styrke datainnhenting/caching for hele SORA + tilstøtende coverage.
- `src/lib/adjacentAreaCalculator.ts`: eventuelt returnere coverage-metadata og sikre at bbox beregnes fra full geometri.
- `src/components/OpenAIPMap.tsx`: robust rendering av SSB 250m-celler, coverage-overlay og Leaflet pane/renderer-fiks.
- Eventuelt `src/components/SoraSettingsPanel.tsx` / `AdjacentAreaPanel.tsx`: kort forklaring om at bare befolkede ruter tegnes.

Forventet resultat:
- Når du zoomer ut etter å ha slått på “Tilstøtende”, skal kartet fortsatt vise alle SSB 250m-ruter med befolkning innenfor hele tilstøtende området.
- Områder uten SSB-ruter skal fremstå som vurdert/dekket via subtil overlay, ikke som at systemet bare har hentet det som var på skjermen.
- Kun “Pådriver” vises med permanent label, slik du ønsket.
- Leaflet-feilen som kan stoppe tegningen fjernes.