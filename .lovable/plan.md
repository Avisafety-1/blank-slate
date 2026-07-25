Jeg fant disse verifiserte strukturelle feilene:

- Polske CTR/MCTR/ATZ-soner er importert som `restriksjonsomrader` med `zone_type='R'`, derfor vises de bare når “Restricted areas” er aktivt og får feil “Activated by NOTAM”-tekst.
- Det finnes ingen `flyplasser`-rader i `airspace_zones`; flyplassrelaterte polygoner ligger i feil lag. 203 PL-rader er flyplassrelaterte kandidater (`CTR`, `MCTR`, `ATZ` + 1km/2km/6km-ringer).
- Ved lav zoom kan PL viewport-treff være svært høyt (hele Polen: ca. 6 607 rader), mens route-proximity-koden kutter til 800 rader. Det forklarer at lag ikke vises komplett når “for mye” treffer samtidig.
- Visningslogikken har samme cache-nøkkel uavhengig av zoom. Når zoom/minZoom gjør at et lag tømmes, kan cache fortsatt tro at bbox er dekket og dermed ikke hente på nytt før man panorerer.

Plan for retting:

1. Database-normalisering for Polen
   - Migrere alle PANSA-rader med `pansa_type` i `CTR`, `CTR1KM`, `CTR6KM`, `MCTR`, `MCTR2KM`, `ATZ`, `ATZ1KM`, `ATZ6KM` fra `restriksjonsomrader` til et flyplass-/luftromslag.
   - Sette `zone_type` til faktisk type (`CTR`, `MCTR`, `ATZ`), ikke `R`.
   - Sette `restriction_type='APPROVAL_REQUIRED'` og rød/tydelig flyplass-stil for flyplasspolygoner.
   - Beholde `properties.pansa_restriction='DRA-R'` som kildeinformasjon, men ikke bruke den til å kalle disse “Activated by NOTAM”.

2. Kartlagsstruktur
   - Koble polske flyplasspolygoner til “Flyplasser”/airspace-visning slik at flyplasser alltid vises når flyplasslaget er på, uten å kreve “Restricted areas”.
   - Sikre at røde flyplasspolygoner rendres over generelle fare-/restriksjonslag, men under rute/NOTAM/popup.
   - La egentlige DRA-R/DRA-P/DRA-I forbli i restricted/rpas/danger-lagene.

3. Popup og tekstlogikk
   - Endre PANSA-popupen slik at “Activated by NOTAM” kun vises for faktiske fleksible DRA-P/DRA-R soner, ikke CTR/MCTR/ATZ/flyplasspolygoner.
   - Lage mer presise labels for PANSA: “Control zone”, “Aerodrome traffic zone”, “Military control zone”, “Drone restricted area”, osv.
   - Beholde lenke til PANSA DroneMap som referanse.

4. Stabil visning ved zoom/pan
   - Gjøre unified-kartlagcache zoom-bevisst eller nullstille cache ved zoomend, slik at lag ikke forsvinner etter zoom inn/ut.
   - Fjerne/øke den lave route-proximity-grensen på 800 rader på en kontrollert måte, eller gruppere/filtrere per relevant lag slik at Polen ikke kuttes tilfeldig når mange soner treffer.

5. Verifisering
   - Kontrollere med database-spørringer at CTR/MCTR/ATZ ligger i riktig lag etter migrering.
   - Teste i kartet over Polen at:
     - flyplasspolygoner vises uten “Restricted areas”,
     - DRA-R fortsatt ligger under restricted,
     - lagene ikke forsvinner ved zoom inn/ut,
     - popupene ikke feilmerker flyplassområder som NOTAM-aktiverte.

Jeg holder fortsatt Norge og eksisterende brukere upåvirket: endringene begrenses til `country_code='PL'`, PANSA-kilden og eksisterende unified allowlist-oppsett for Moderavdeling.