# Samle Tensios egne dokumenter i hovedselskapet

## Hva jeg fant

Tensio-strukturen er: **Tensio** (hovedselskap) med avdelingene **Tensio Nord** og **Tensio Sør**.

Dokumenter Tensio-folk selv har lastet opp:

**1. Ligger på en avdeling i stedet for hovedselskapet (8 stk – eid av Tensio Nord)**
- 1., 2. og 3. SORA_Assessment_BVLOS_powerline_inspection
- Normale sjekklister DJI FlyCart 100
- Prosedyrer – Løfteoperasjoner
- Systembeskrivelse – DJI FlyCart 100
- SJEKKLISTE Matrice 350&400-serien V2.0
- Sjekkliste – Before takeoff

Seks av disse er i dag kun delt med hovedselskapet, ikke med Tensio Sør – det er derfor folk i Sør ikke ser dem. Selve filene ligger allerede i hovedselskapets lagringsmappe.

**2. Ligger riktig (Tensio), men er ikke delt nedover (10 stk)**
- Tensio OM
- Vedlegg 121, 122, 201, 211, 221, 231, 262, 271 og 420

**3. Allerede riktig (34 stk)**
Eid av Tensio og delt nedover – ingen endring.

## Det som skal gjøres

- Flytte de 8 avdelingsdokumentene over til hovedselskapet Tensio.
- Slå på «synlig for avdelinger» på alle 18 dokumentene over, slik at både Tensio Nord og Tensio Sør ser dem.
- Beholde eksisterende delinger; ingenting slettes.

## Dette røres ikke

Systemgenererte dokumenter er knyttet til den avdelingen som eier hendelsen, og skal bli liggende der:
- Loggbok- og serviceoppføringer og hendelsesrapport (Tensio)
- To risikovurderinger fra oppdrag (Tensio Sør)
- To KMZ-kartfiler (Tensio Nord)

## Påvirker dette noe annet?

Kort sagt: nei, alle koblinger følger med.

- **Droner:** 5 dokumentkoblinger til droner i Tensio Nord (LN.0510.AA og AO) og sjekklisten «Normale sjekklister DJI FlyCart 100» på LN.0510.AO beholdes. De blir synlige for flere, ikke færre.
- **Oppdrag:** ca. 50 koblinger mellom dokumenter og oppdrag er uberørt.
- **Mapper:** alle de berørte dokumentene ligger i Tensios egne mapper «OM V3.0» og «OM V2.5» – uendret.
- **Filene:** ligger allerede i hovedselskapets lagringsmappe, så nedlasting fungerer som før.
- **Tilgang:** ingen mister tilgang. Avdelingene får se mer, aldri mindre.

## Én ting du bør vite

«Sjekkliste – Before takeoff» (eid av Tensio Nord, brukt på 22 oppdrag) har **ingen fil** lagret – bare en dokumentrad. Den kan derfor ikke åpnes uansett hvem som prøver. Flyttingen fikser ikke det; noen i Tensio må laste opp selve filen. Jeg kan eventuelt liste opp alle slike tomme dokumenter i Tensio hvis du vil.

## Teknisk

Dataoppdatering på `documents` for de 18 radene: `company_id` settes til Tensio (`50c5b8af-…`) for de 8, og `visible_to_children = true` på alle 18. `fil_url` endres ikke (filene ligger allerede i Tensios mappe). `document_department_visibility`, `drone_documents`, `mission_documents`, `document_folder_items` og sjekklistefelt på droner røres ikke. Ingen kodeendringer.
