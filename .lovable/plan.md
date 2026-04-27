Jeg anbefaler å gå over til 250 m SSB-data for beregningene, men ikke nødvendigvis gjøre 250 m-laget til standard visuelt kartlag. Beregningene bør bruke 250 m fordi det gir riktig presisjon og passer malen dere beskriver. Kartvisning kan støtte 250 m som et valgbart lag, men med zoom-/bbox-begrensning slik at det ikke blir unødvendig tungt.

Svar på belastning: Det blir ikke stor belastning hvis vi henter 250 m-data kun for aktuell rute/buffer og ikke for hele kartutsnittet hele tiden. 250 m gir opptil 16 ganger flere ruter enn 1 km, så vi bør begrense henting til operasjonsfotavtrykket og eventuelt kun vise 250 m-laget på høy zoom.

Plan:

1. Endre bakkerisiko-/befolkningsberegning i AI-risikovurderingen
- Bytt fra dagens 1 km WFS-oppslag i `ai-risk-assessment` til 250 m SSB-rutenett.
- Beregn operasjonens fotavtrykk som:
  - planlagt rute
  - Flight Geography buffer
  - Contingency buffer
  - Ground Risk Buffer
- Finn SSB 250 m-ruter som overlapper dette fotavtrykket.
- Bruk høyeste overlappende rute som dimensjonerende verdi:
  - `befolkning per 250m-rute × 16 = personer/km²`
- Beregn også gjennomsnittlig befolkningstetthet for fotavtrykket som støtteinformasjon, men la høyeste rute styre kategorien/iGRC.

2. Legg inn sporbar dokumentasjon i risikovurderingen
- Utvid `populationDensity`/`ground_risk_analysis` med forklarende felter, for eksempel:
  - datakilde: SSB befolkning på rutenett 250 m, år 2025
  - metode: høyeste overlappende 250 m-rute × 16
  - høyeste 250 m-rute: antall personer i ruten
  - dimensjonerende tetthet: personer/km²
  - gjennomsnittlig tetthet i fotavtrykket
  - antall overlappende ruter
  - fotavtrykk/buffergrunnlag: FG + contingency + GRB
  - drivende plassering: nærmeste rutepunkt eller rutesegment
- Oppdater AI-prompten slik at teksten følger malen dere ga, og eksplisitt sier hvordan tallet er regnet ut.

3. Identifiser hvilket rutepunkt/segment som driver tallet
- For den ruten med høyest befolkningstall finner vi nærmeste rutepunkt eller nærmeste rutesegment.
- I rapporten vises f.eks.:
  - “Dimensjonerende SSB-rute ligger nær segment P3–P4”
  - eller “nær rutepunkt P2” hvis den ligger nærmest et punkt.
- Hvis presis segmentplassering ikke kan fastslås trygt, faller teksten tilbake til koordinat/område og sier at ruten ligger innenfor operasjonens fotavtrykk.

4. Oppdater visning i app og PDF
- I `GroundRiskAnalysisSection` vises en tydelig beregningsforklaring under bakkerisiko:
  - “SSB 250 m-rute: X personer × 16 = Y pers/km²”
  - “Gjennomsnitt i fotavtrykk: Z pers/km²”
  - “Dimensjonerende del av ruten: Pn–Pm”
- I PDF-eksporten legges samme metode/forklaring inn, slik at risikovurderingen er dokumenterbar.

5. Juster kartets SSB-lag
- Endre dagens kartlag “Befolkning 1km² (SSB)” til enten:
  - “Befolkning 250 m (SSB)” på høy zoom, eller
  - to valg: “Befolkning 1 km” og “Befolkning 250 m”.
- Jeg anbefaler to valg, med 250 m deaktivert som standard og begrenset til høy zoom, fordi 1 km er mer oversiktlig visuelt mens 250 m er riktig for beregning/dokumentasjon.
- Oppdater legend-tekst slik at den tydelig sier om laget viser 1 km eller 250 m, og at risikovurderingen bruker 250 m.

Teknisk gjennomføring:

- Gjenbruk/utvid eksisterende `ssb-population` edge function, som allerede støtter `resolution=250`.
- Flytt eller dupliser nødvendig buffer-/polygonlogikk slik at edge functionen `ai-risk-assessment` kan bruke samme fotavtrykk som kartet.
- Oppdater datatyper i `src/types/map.ts` og `AdjacentAreaResult`/relaterte visninger med nye dokumentasjonsfelter.
- Oppdater `supabase/functions/ai-risk-assessment/index.ts` slik at 250 m-resultatet mates deterministisk inn i AI-vurderingen, i stedet for at modellen må gjette metode.
- Ingen nye databasetabeller er nødvendig med mindre dere ønsker å lagre disse beregningsdetaljene separat; i første omgang kan de lagres i eksisterende JSON-resultat/rutedokumentasjon.

Forventet resultat:

- Risikovurderingen følger malen:
  “Vi bruker befolkningstetthetsdata fra SSB ... 250-meters rutenett ... høyeste overlappende rute × 16 ...”
- Tallet blir etterprøvbart.
- Buffer-sonene tas med.
- Rapporten viser både dimensjonerende maksverdi og gjennomsnittlig tetthet.
- Kartet kan vise 250 m uten at det blir tungt, fordi laget holdes valgfritt og zoom-begrenset.