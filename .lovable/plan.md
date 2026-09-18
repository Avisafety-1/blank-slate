# Redusere minnebruk i databasen

Databasen din har ca. 1,77 GB RAM. Målingen viser 1,98 GB "committed" og tung bruk av swap (opp mot 2,79 GB totalt) — altså jevnt overforbruk, ikke en enkelt topp. Under er det som faktisk driver forbruket, verifisert mot databasen nå.

## Hva som er bekreftet

- **30 153 planlagte jobbkjøringer siste døgn.** Tre jobber står for nesten alt: live-publisering hvert 5. sekund (17 280/døgn), trafikkdata hvert 10. sekund (8 640) og advisory hvert 30. sekund (2 880). Hver kjøring starter en egen prosess i databasen — dette er den største enkeltkilden til minnepress.
- **Loggtabellen for jobbkjøringer er 172 MB** (44 292 rader), og HTTP-svarkøen har 6 161 rader. Daglig opprydding finnes, men holder ikke tritt.
- **31 åpne, ledige app-tilkoblinger.** Hver av dem reserverer minne.
- **19 tabeller i sanntidsstrømmen, hvorav 16 har "full radkopi"** (REPLICA IDENTITY FULL). Det dobler arbeidet databasen gjør per endring.
- **146 MB midlertidige filer** — spørringer som ikke får plass i minnet og går til disk.
- **Store statiske karttabeller:** befolkningsrutenett 574 MB, luftromssoner 544 MB, ventende DJI-logger 272 MB. Samlet database 1 873 MB mot bare 512 MB hurtigminne — hvert kartoppslag skyver annet ut av cache.
- **Trege spørringer mot `documents`:** henter alle kolonner uten selskapsfilter, 389 ms i snitt.

## Umiddelbare tiltak (uke 1, ingen funksjonstap)

1. **Kutt jobbfrekvens der det ikke merkes.** Trafikkdata fra 10 → 20 sekunder og advisory fra 30 → 60 sekunder halverer ca. 7 000 prosessoppstarter i døgnet. Live-publisering til SafeSky beholdes på 5 sekunder (det er anbefalingen deres), men jobben avsluttes umiddelbart når ingen live-flyging pågår, slik at kjøringen blir nesten gratis.
2. **Rydd loggtabellene og frigjør plassen.** Behold 7 dager med jobblogg og 1 dag med HTTP-svar, og kjør en full komprimering én gang for å gi tilbake de 172 MB.
3. **Slå av "full radkopi" på sanntidstabeller som ikke trenger det.** Fire tabeller leser bare id-en ved sletting og kan trygt settes til standard. `incident_comments` beholder full kopi (koden leser flere felt der).
4. **Ta tabeller ut av sanntidsstrømmen som ingen lytter på.** Flere av de 19 tabellene har ingen aktiv lytter i appen; de koster arbeid uten nytte.
5. **Indekser for de tunge spørringene** mot `documents` (selskap + kategori + sortering) og be appen hente kun kolonnene den viser. Fjerner størstedelen av de midlertidige filene.

Forventet effekt: merkbart lavere swap-bruk og færre prosesser, men databasen vil fortsatt ligge nær taket fordi datamengden alene overstiger minnet.

## Langsiktig (det som faktisk fjerner taket)

1. **Flytt de store statiske kartdataene ut av hovedbasen.** Befolkningsrutenett og luftromssoner (1,1 GB til sammen) leses av alle, endres sjelden og konkurrerer i dag med driftsdata om hurtigminnet. De bør serveres som ferdige kartfliser/filer fra fillagring i stedet.
2. **Arkiver ventende DJI-logger (272 MB).** Rådataene bør ligge i fillagring, ikke som rader i databasen.
3. **Flytt høyfrekvent posisjonsinnhenting ut av databasens tidsplanlegger.** MQTT-broker-en kjører allerede som egen tjeneste — samme tjeneste kan drive 5-sekunders-publiseringen direkte i stedet for at databasen starter en prosess hvert 5. sekund.
4. **Oppgrader databasestørrelsen.** Med 1,87 GB data på 1,77 GB RAM er dere per definisjon underdimensjonert. Neste trinn (4 GB) gir hodetak til vekst; det er den eneste endringen som virker umiddelbart uten kodearbeid. Tiltakene over gjør at dere ikke må hoppe videre til 8 GB med det første.

## Anbefalt rekkefølge

Start med punkt 1–2 i "umiddelbare tiltak" og mål i 24 timer. Oppgrader til 4 GB parallelt hvis dere vil ha ro med én gang. Punkt 3–5 og de langsiktige tiltakene tas etterpå, ett om gangen med måling mellom.

## Teknisk oppsummering

- `cron.alter_job` på jobb 13 og 14; tidlig retur i `safesky-live-publish` når ingen aktive live-flyginger.
- `DELETE` + `VACUUM FULL` på `cron.job_run_details` og `net._http_response`; strammere `cleanup-cron-logs`.
- `ALTER TABLE ... REPLICA IDENTITY DEFAULT` på utvalgte tabeller; `ALTER PUBLICATION supabase_realtime DROP TABLE` for tabeller uten lyttere.
- Sammensatt indeks på `documents (company_id, kategori, tittel)` og smalere `select()` i dokumentspørringene.
- Ingen endring i RLS, tilgangsstyring eller SafeSky-protokollen.
