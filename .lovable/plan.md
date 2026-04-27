Du har rett: det AI-svaret du viser er ikke helt det vi ønsket å oppnå. Koden har støtte for SSB 250 m-feltene, men teksten som vises mangler fortsatt selve forklaringen i dette resultatet. Det betyr enten at vurderingen ble generert før/uten de nye feltene, eller at AI-outputen ikke fikk/populerte feltene tydelig nok i den synlige bakkerisiko-blokken.

Plan for å gjøre dette robust:

1. Etterbehandle AI-resultatet deterministisk
- I `ai-risk-assessment` skal vi ikke stole på at modellen selv husker å skrive beregningen.
- Når SSB 250 m-data finnes, overskriver vi/bygger disse feltene etter AI-kallet:
  - `population_density_value` = høyeste 250 m-rute × 16
  - `population_density_calculation` = f.eks. `356 personer i 250 m-rute × 16 = 5 696 personer/km²`
  - `population_density_average` = gjennomsnitt i hele fotavtrykket
  - `population_density_driver` = nærmeste rutepunkt/segment
  - `population_density_source` = `SSB befolkning på rutenett 250 m (2025)`
  - `population_density_footprint` = `Planlagt rute + Flight Geography + Contingency + Ground Risk Buffer`
- Dette finnes delvis allerede, men jeg vil stramme det inn slik at feltene alltid får norske, ferdigformaterte verdier og ikke kan utebli fra visningen.

2. Vis forklaringen direkte under “Befolkning”
- I `GroundRiskAnalysisSection` skal SSB-beregningen ligge rett under befolkningstallet, ikke bare som en ekstra blokk som kan bli oversett.
- Teksten skal følge malen din, f.eks.:

```text
Datakilde: SSB befolkning på rutenett 250 m (2025)
Fotavtrykk: Planlagt rute + Flight Geography + Contingency + Ground Risk Buffer
Beregning: 356 personer i dimensjonerende 250 m-rute × 16 = 5 696 personer/km²
Gjennomsnitt i fotavtrykk: 2 805,7 personer/km²
Dimensjonerende del av ruten: nær segment P2–P3
```

3. Rette forvirrende kategoritekst
- Eksempelet viser `Tett befolket (<1500/km²)` samtidig som maks tetthet er `5703 personer/km²`. Det er selvmotsigende.
- Jeg vil justere prompt/etterbehandling slik at:
  - `>1500/km²` klassifiseres som `Folkemengder / svært tett befolket` eller tilsvarende valgt SORA-band.
  - AI ikke skriver `Tett befolket (<1500/km²)` når verdien er over 1500.
- Hvis dere ønsker å beholde ordlyden “Tett befolket” også over 1500, kan vi kalle det `Tett befolket (>1500/km²)` i stedet, men tallet og terskelen må stemme.

4. Oppdatere PDF-eksporten tilsvarende
- PDF-en har allerede et felt for SSB-beregning, men jeg vil sikre at den alltid viser samme metodeblokk som UI-en.
- Beregningen blir dermed synlig både i appen og i eksportert risikovurdering.

5. Eksisterende analyser
- Vurderinger som allerede er generert får ikke automatisk ny AI-tekst med mindre de regenereres.
- Etter endringen må den aktuelle risikovurderingen kjøres på nytt for å få de nye feltene og den nye forklaringsteksten.

Teknisk merknad:
- Jeg vil ikke legge til nye databasetabeller.
- Endringen ligger i edge functionens etterbehandling og i visningen av `ground_risk_analysis`.
- Jeg vil også sjekke siste funksjonslogger etter implementering for å bekrefte at 250 m-beregningen faktisk kjøres for nye analyser.