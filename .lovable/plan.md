# Åpne loggfiler uten rutepunkter

## Bekreftet årsak

Loggen du nevnte (22. juni 2026, 900 min, Gard Haug-Hansen) er en manuelt registrert flytur uten rute: `source = manual`, `flight_track` er tom, 0 rutepunkter.

Analysedialogen avbryter i dag rendringen helt når det ikke finnes posisjoner (`if (!flightTrack || !positions.length) return null;`), så dialogen "åpner" uten å vise noe. All annen informasjon (varighet, batteri, GPS, identifikatorer, hvem som er pilot/drone/oppdrag, hendelser) bygges allerede, men blir aldri vist.

## Hva som endres

Dialogen skal alltid åpne så lenge det finnes en loggpost, og bare skjule de delene som krever telemetri:

- Fjern «return null»-blokkeringen; vis dialogen med sammendragspanelet, «logget på»-seksjonen, identifikatorer og batteridata som vanlig.
- Skjul kart, tidslinje/avspiller, 3D-visning, fartsspor og hastighetsgrafer når det ikke finnes posisjoner — ingen tomme kartbokser eller kontroller som ikke gjør noe.
- Vis en tydelig, oversatt merknad øverst: «Ingen rutedata i denne loggen» (manuelt registrert flytur / logg uten telemetri), slik at det ikke ser ut som en feil.
- Delvis data håndteres på samme måte: har loggen posisjoner men mangler f.eks. fart, høyde eller gyro, vises kartet, mens kun de manglende panelene skjules.
- Ingen «kunne ikke laste»-toast for logger uten rute — den skal kun komme ved reell feil i henting.

Gjelder alle steder som åpner analysen: Loggfiler-fanen på /oppdrag, oppdragskort, oppdragsdetaljer, dronens loggbok og pilotens loggbok — de bruker samme dialog.

## Teknisk

- `src/components/dashboard/FlightAnalysisDialog.tsx`: fjern tidlig `return null`, innfør `hasTrack = positions.length > 0` og betinget rendring av kart/tidslinje/3D/grafer; kartinitialisering og alle Leaflet-effekter hoppes over når `hasTrack` er false (unngår Leaflet-init på skjult container).
- `src/components/flightlogs/FlightLogsView.tsx`: åpne dialogen også når `flight_track` er tom (feilmelding kun ved reell henting-/nettverksfeil).
- Nye i18n-nøkler i `no.json` og `en.json` for merknaden om manglende rutedata.
- Ingen databaseendringer.
