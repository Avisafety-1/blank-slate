# Riktig distanse og snittfart på nye DJI-logger

## Bakgrunn
Gamle logger skal ikke røres. Målet er at logger som behandles fra nå av får riktige tall.

## Finnes tallet allerede i loggen?
Delvis, men ikke i brukbar form:
- DJI leverer et eget felt for total distanse, men det er nettopp dette feltet som er feil. I de kontrollerte Elverum-loggene er verdien i praksis kilometer selv om den er merket som meter: `2` der GPS-sporet er ca. `1 778 m`, og `1` der sporet er ca. `852 m`.
- Loggene har også avstandsfelter per målepunkt, men de beskriver avstand fra startpunktet, ikke hvor langt dronen faktisk har fløyet. De kan derfor ikke brukes som total strekning.
- GPS-punktene i loggen er derimot pålitelige og ligger i full oppløsning under import.

Konklusjon: vi må summere strekningen fra loggens egne GPS-punkter, men bruker fortsatt DJIs verdi når den er troverdig.

## Endringer
1. **Distanse ved import**
   - Summer faktisk fløyet strekning fra loggens GPS-punkter i full oppløsning, før sporet forenkles for kartvisning.
   - Hopp over ugyldige punkter, GPS-støy i ro og urimelige hopp, slik at dårlig satellittdekning ikke blåser opp tallet.
   - Bruk DJIs eget tall når det stemmer med sporet, og GPS-summen når feltet er tomt eller åpenbart har feil enhet.
   - Samme beregning brukes i alle importveier: manuell opplasting, enkeltbehandling og automatisk synk, slik at resultatet blir likt uansett hvordan loggen kommer inn.

2. **Snittfart**
   - Vis snittfart som total distanse delt på hele flytiden, i tråd med valget ditt.
   - Samme verdi vises uansett hvor loggen åpnes, og formatering i meter/kilometer og m/s beholdes.

3. **Ingen endring av gamle logger**
   - Ingen datamigrering. Logger som allerede er behandlet, beholder dagens verdier.

## Verifisering
- Tester for feil enhet, manglende DJI-verdi, korte og stillestående flygninger samt GPS-hopp.
- Kontroll av at et spor på ca. 1,78 km gir riktig distanse og tilhørende snittfart.
- Typekontroll og kontroll av kort og analysevindu på mobil.

## Tekniske detaljer
- Ingen databaseendring; distansen lagres fortsatt i meter i samme felt.
- Beregningen skjer før posisjonene reduseres, slik at hele datagrunnlaget brukes.
