# Korrigere DJI-distanse og gjennomsnittsfart

## Bekreftet årsak
- DJI-importen lagrer `DETAILS.totalDistance [m]` direkte som meter.
- I de berørte DJI Mini 5-loggene er verdien i praksis kilometer: en logg lagret som `2 m` har et GPS-spor på ca. `1 778 m`, og en logg lagret som `1 m` har ca. `852 m`.
- Både oversikten og detaljvisningen bruker den samme feilaktige lagrede distansen.
- Gjennomsnittsfarten beregnes i dag som et enkelt gjennomsnitt av utvalgte målepunkter. Den skal i stedet være total distanse delt på hele flytiden, som valgt.

## Endringer
1. **Én robust distanseberegning for DJI-import**
   - Beregn faktisk fløyet distanse fra fortløpende, gyldige GPS-punkter i full oppløsning før sporet reduseres for lagring og visning.
   - Filtrer ugyldige koordinater og urimelige GPS-hopp, slik at dårlig satellittlås ikke blåser opp distansen.
   - Sammenlign GPS-distansen med DJI-metadata og normaliser den kjente km/m-feilen. Bruk GPS-distansen som sikker reserve når metadata mangler eller åpenbart har feil enhet.
   - Samle logikken i den delte DJI-parseren og bruke samme funksjon i manuell opplasting, enkeltbehandling og autosynk, slik at importmåtene ikke gir ulike resultater.

2. **Riktig visning i oversikt og detaljvisning**
   - La `/oppdrag-loggfiler` fortsatt lese én normalisert verdi i meter, slik at kort og detaljvisning alltid samsvarer.
   - Beregn gjennomsnittsfart som `total distanse / faktisk total flytid` og vis den samme verdien uavhengig av hvor loggen åpnes.
   - Behold dagens formatering i meter/kilometer og m/s.

3. **Rette eksisterende DJI-logger**
   - Kjør en kontrollert datamigrering for DJI-logger der lagret distanse mangler eller avviker tydelig fra GPS-sporet.
   - Beregn ny distanse fra eksisterende lagrede posisjoner, og oppdater både ferdige flylogger og tilhørende ventende/importerte poster der de har den samme feilverdien.
   - Begrens oppdateringen til sikre avvik, slik at korrekte logger og manuelle/ArduPilot-logger ikke endres.

4. **Verifisering**
   - Legg inn tester for kilometer-feilen, manglende metadata, korte/stasjonære flygninger og GPS-hopp.
   - Kontroller de konkrete Elverum-loggene mot GPS-sporet, blant annet at `2 m` blir omtrent `1,78 km` og at snittfarten følger distanse delt på hele flytiden.
   - Verifiser kortet og analysevinduet på mobil, samt kjør typekontroll og relevante funksjonstester.

## Tekniske detaljer
- Nye importer lagrer fortsatt meter i `total_distance_m`; ingen ny kolonne er nødvendig.
- Beregningen gjøres før posisjonene reduseres for kartvisning, slik at fremtidige logger bruker hele datagrunnlaget.
- Eksisterende logger kan bare korrigeres med de lagrede punktene, men kontrollmålingen viser at disse gir realistiske verdier for de aktuelle loggene.
