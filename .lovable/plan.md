# Arkivere luftromsdata og befolkningsdata for å frigjøre minne

## Bakgrunn (målt nå)
- Luftromssoner: 544 MB totalt. Tyskland 46 315 soner (ca. 198 MB) og Polen 6 610 soner (ca. 79 MB). Sverige (10 985), Danmark (5 175) og Finland (1 049) er små.
- Befolkningsrutenett: 574 MB, 1 901 599 ruter for hele Europa. Kun 391 094 ruter ligger i Norden/nærområdet (lat 54–72, lng 4–32).
- Disse to tabellene er de klart største og konkurrerer om hurtigminnet med daglig drift.

## Det som skal gjøres

1. **Eget arkivområde i databasen**
   - Nytt skjema `archive` som ikke er tilgjengelig for appen (ingen API-tilgang, kun administrativt).
   - To arkivtabeller med samme kolonner som originalene, men uten tunge kartindekser — de koster minne og trengs ikke for data som ikke brukes.

2. **Flytte tysk og polsk luftromsdata til arkivet**
   - Tyskland og Polen flyttes ut av den aktive tabellen. Sverige, Danmark og Finland blir liggende som i dag.

3. **Flytte befolkningsruter utenfor Norden til arkivet**
   - Alle ruter utenfor lat 54–72 / lng 4–32 flyttes. Ca. 391 000 ruter (Norden og nærområdet) blir igjen, så kart, SORA-analyse og AI-risikovurdering virker uendret i området dere flyr i.

4. **Rydde opp plassen**
   - Etter flyttingen må tabellene komprimeres (`VACUUM FULL` + `REINDEX`) for at plassen faktisk frigjøres. Dette må kjøres manuelt i Supabase sin SQL-editor fordi det ikke kan kjøres i en transaksjon. Jeg leverer ferdige kommandoer, og de bør kjøres i en rolig periode (tabellene er låst i noen minutter).
   - Samtidig komprimeres `pending_dji_logs`, som har 272 MB oppblåst plass mot bare 1,3 MB reelle data.

5. **Hente data tilbake senere**
   - Én ferdig kommando per datasett som flytter radene tilbake fra arkivet. Ingenting slettes, så det er alltid mulig å reversere.

## Forventet effekt
Ca. 280 MB luftromsdata og ca. 400 MB befolkningsdata ut av den aktive databasen, pluss ca. 270 MB frigjort oppblåst plass — til sammen rundt 900 MB mindre å holde i minnet.

## Påvirkning på appen
- Ingen kodeendringer. Kart, sikkerhetsanalyse, SORA og AI-vurdering spør mot de samme tabellene som før.
- Tyske og polske luftromssoner vises ikke lenger i kartet. Befolkningslaget er tomt utenfor Norden.
- Synkroniseringsjobbene for Tyskland/Polen bør settes på pause, ellers fylles dataene inn igjen ved neste kjøring. Jeg sjekker og deaktiverer de jobbene som finnes.

## Teknisk
- Migrasjon: `CREATE SCHEMA archive`; `archive.airspace_zones_archive` og `archive.eurostat_population_1km_archive` som `LIKE ... INCLUDING DEFAULTS` uten GIST-indekser; ingen GRANT til `anon`/`authenticated` (kun `service_role`/`postgres`), RLS av siden skjemaet ikke eksponeres via API.
- Dataflytting via `WITH moved AS (DELETE FROM ... WHERE ... RETURNING *) INSERT INTO archive...`, i porsjoner for befolkningstabellen.
- Filtre: `airspace_zones.country_code IN ('DE','PL')`; `NOT (ST_Y(ST_Centroid(geom)) BETWEEN 54 AND 72 AND ST_X(ST_Centroid(geom)) BETWEEN 4 AND 32)`.
- Manuelt i SQL-editor etterpå: `VACUUM FULL ANALYZE public.airspace_zones; REINDEX TABLE public.airspace_zones; VACUUM FULL ANALYZE public.eurostat_population_1km; REINDEX TABLE public.eurostat_population_1km; VACUUM FULL ANALYZE public.pending_dji_logs;`
- Cron/sync: sjekk `cron.job` for `sync-de-drone-zones` og polske jobber og deaktiver dem.
