# Fase 3: Koden bestemmer, AI-en beskriver

Ingen databaseendringer. Tallreglene fra fase 1–2 (iGRC-tabell, mitigeringer, SAIL, `decideApproval`, observatør/M1(C), kompetanse) gjenbrukes uendret. Punktene gjøres i rekkefølge, og appen skal kjøre etter hvert punkt.

## 1) Nye faste regler
- **Reservebatteri** (`hardStops.ts`, ny ren `batteryCount.ts`): når `require_backup_battery` er på, telles batterier som er valgt på oppdraget eller koblet til primærdronen. Hver utstyrs-id telles én gang, med samme alias-regel som `isBatteryType`. Under 2 batterier gir hard stop `backup_battery` (utstyr) med teksten «Selskapet krever reservebatteri, men oppdraget har bare N batteri(er)» (NO/EN). Utstyrskategorien lister alltid opp batteriene som er talt, og hvor de kommer fra.
- **Tåke** (`drone-weather`): `fog_area_fraction` (null når feltet mangler) sendes med i `current` og `hourly_forecast`. Først bekreftes det med et kall mot MET `/complete` for norske koordinater at feltet finnes. Finnes det ikke, brukes bare symbolet `fog`. I risikovurderingen gir ≥ 50 % tåke eller et tåkesymbol minst BETINGET med teksten «Tåke meldt — kontroller sikt mot selskapets grense (X km) før flyging». Sikt fjernes som hard stop i promptene.
- **CTR uten klarering**: fjernes som hard stop i promptene. Varslene om Ninox/PPR beholdes.

## 2) Systembeslutninger før AI-kallet
- Ny ren modul `systemDecisions.ts` med `buildSystemDecisions(...)`. Den samler hard stops (inkludert utstyr og de nye reglene), iGRC/fGRC/mitigeringer, AEC/ARC, SAIL, ALOS, status for drone og utstyr, `dataAvailability`, tåkevarsel og fakta om ATC/Ninox.
- Resultatet sendes til AI-en som `contextData.systemDecisions` med instruksen «Dette er fastsatt av systemet. Gjengi verdiene, ikke beregn eller endre dem.»
- Etter AI-svaret skrives systemverdiene inn i `aiAnalysis` som i dag, slik at AI-en aldri kan overstyre dem.

## 3) Slankere prompter (NO og EN)
- Fjerne tabeller og regnesteg for iGRC/M1/M2/SSB, AEC/ARC, ALOS, SAIL og vilkårene for hard stop. De erstattes av en kort forklaring av feltene i `systemDecisions`.
- Fjerne ATC-bonusen, som i dag telles dobbelt, og den doble «ikke bekreftet»-bekymringen.
- Beskrive `primaryDrone.status` riktig: det er dronens egen status. `aggregatedStatus` og `linkedOnlyIssues` er bare til informasjon.
- Fjerne motstridende CTR-regler og rette feltnavnet `dew_point`.
- AI-en leverer bare tekst og score per kategori (1–10, én desimal). `go_decision` per kategori kan bare være GO eller BETINGET.
- Måle og oppgi antall tegn i system- og brukerprompt før og etter.

## 4) Konsistens etter AI-svaret
- Ny ren modul `consistency.ts`:
  - En kategori med hard stop får NO-GO og maks score 3.0.
  - Samlet score er maks 4.9 når det finnes hard stop.
  - Skriver AI-en NO-GO uten hard stop, settes kategorien til BETINGET, og AI-ens bekymringer beholdes.
- Koden setter inn én fast første setning i oppsummeringen («Anbefaling: NO-GO — hard stop: …» / «Forsiktighet (AI-score X/10)» / «GO (AI-score X/10)»). `removeHardStopClaims` begrenses, slik at den ikke sletter innledningen.

## 5) Robusthet og ytelse
- SORA-revurderingen bruker `response_format: json_object`, samme tokengrense og samme JSON-reparasjon som hovedkallet.
- Kompakt `contextData`: ingen innrykk, ingen rutekoordinater (bare antall punkter, lengde og `soraSettings`) og ingen duplikater.
- Vær, Kp, luftrom, befolkning, arealbruk og SORA-config hentes parallelt med `Promise.allSettled`. En feil i én kilde stopper ikke de andre.
- Total varighet og varighet per kilde logges.

## Validering
- `deno test supabase/functions/ai-risk-assessment/` og `deno check` på både `ai-risk-assessment/index.ts` og `drone-weather/index.ts`.
- Nye tester:
  - Batteri: 0, 1 og 2 batterier, og samme batteri både valgt og koblet.
  - Tåke.
  - `buildSystemDecisions`: hard stop og SAIL.
  - Konsistensregler.
  - Fast første setning i oppsummeringen.
- Før/etter-sammenligning: promptstørrelsen måles lokalt. Prosjektet bruker en ekstern Supabase der jeg ikke kan logge inn som bruker. Derfor ber jeg deg kjøre én vurdering på et eksisterende oppdrag før og etter deploy. Deretter sammenligner jeg iGRC/fGRC/SAIL, hard stops, anbefaling og varighet fra lagrede rader og logger.
- Oppsummering av endrede filer til slutt. `AGENTS.md` får én regel: systembeslutninger beregnes før AI-kallet, og AI-en gjengir dem.
