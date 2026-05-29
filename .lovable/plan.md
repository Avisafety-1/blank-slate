## Årsak

Jeg slo opp den aktuelle flyturen i databasen (`flight_logs.id = d8f7dcd8-…`, mission «DJI-flylogg 01.09.2025 20:54»):

- `flight_track = { "positions": [] }` — altså **null punkter**.
- Notater: «Importert fra DJI-flylogg. Maks hastighet: 0.9 m/s, **Min batteri: N/A**».
- Lokasjon på oppdraget: «Ukjent» (fordi `result.startPosition` var null).
- Varighet: 2 min, maks fart 0.9 m/s.

Knappene «Analyser / GPX / KMZ» rendres i `MissionCard.tsx` (linje 784) og `MissionDetailDialog.tsx` (linje 375) kun når `log.flight_track?.positions?.length > 0`. Når posisjonslista er tom finnes det ingenting å analysere eller eksportere — derfor mangler knappene.

Hvorfor er posisjonslista tom? Det importerte filopplastet er en gyldig DJI-logg (parsing satte tittel, varighet og maks fart), men selve loggen inneholdt **ingen brukbare GPS-punkter**. Typiske grunner:
- Innendørs flyging eller flyging uten GPS-fix (DJI Mini-serien lagrer da posisjoner som 0/null, og parseren filtrerer dem bort).
- Veldig kort flyging (her bare 2 min, maks 0.9 m/s) — sannsynligvis en test-/sjekk-flyging ved bakken hvor GPS-lås aldri ble etablert.
- Loggfiltype uten `OSD.latitude/longitude`-kolonner (f.eks. DJI Fly tekstlogg fra eldre fastvare).

I databasen finnes 9 av 472 flyloggene uten posisjoner — de fleste er manuelt loggførte (uten DJI-import), men denne ene er en faktisk DJI-import uten GPS-data.

## Foreslått UX-forbedring

Selve atferden er korrekt — vi kan ikke vise rute uten punkter — men i dag er det ingenting som forklarer hvorfor knappene mangler, så det føles som en bug. Jeg foreslår å vise et lite hint på flyturraden når `flight_track?.positions` er tom (eller null), slik at brukeren ser at det er forventet:

- I `src/components/oppdrag/MissionCard.tsx` (rundt linje 784) og `src/components/dashboard/MissionDetailDialog.tsx` (rundt linje 375): legg til en `else`-gren som rendrer en liten muted-tekst, f.eks. `Ingen posisjonsdata — analyse og ruteeksport utilgjengelig` med samme typografi som de eksisterende knappene.
- Ingen DB-/RLS-endringer. Ingen endringer i import-/parser-logikk.

## Hva som ikke endres

- Vi forsøker ikke å «redde» eksisterende logger uten posisjoner — kildedataene finnes ikke.
- DJI-parseren endres ikke nå. Hvis du sender meg én av råfilene som ga tom posisjonsliste, kan jeg verifisere om det er filtype/parser-grunn og evt. utvide parseren i en egen runde.

Vil du at jeg legger inn hint-teksten?