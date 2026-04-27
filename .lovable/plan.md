Du har helt rett: iGRC/fGRC kan ikke variere mellom 7–10 på tre identiske kjøringer. Dette er et tegn på at for mye av SORA-bakkerisikoen fortsatt overlates til AI-modellen. Vi bør gjøre selve iGRC/fGRC-beregningen deterministisk i kode, og kun la AI forklare/kommentere rundt resultatet.

Plan:

1. Legg inn deterministisk iGRC-motor i `ai-risk-assessment`
- Beregn iGRC fra faste inputs:
  - dronens karakteristiske dimensjon fra `drone_models.characteristic_dimension_m`
  - maks hastighet fra `drone_models.max_speed_mps`
  - SSB 250 m maks befolkningstetthet (`populationDensity.maxDensity`)
- Bruk én fast SORA-matrise i kode, slik at samme oppdrag alltid får samme iGRC.
- Tillat iGRC 8–10 der matrisen tilsier dette, men merk tydelig at verdier >7 ligger utenfor ordinær SORA og krever særskilt/sertifisert vurdering.

2. Gjør befolkningstetthetskategorien entydig
- Bruk maksverdien fra SSB 250 m som styrende verdi, ikke gjennomsnittet.
- Bruk gjennomsnitt kun som støtteinformasjon i teksten.
- Sørg for at høyeste kategori blir konsekvent, f.eks. `Folkemengder / svært tett befolket (>1500/km²)` når maksverdien er over 1500.

3. Stopp tilfeldig reduksjon fra mitigeringer
- Ikke la AI bestemme om M1/M2-reduksjoner skal gis.
- Etter AI-svaret skal edge-funksjonen overskrive mitigeringene med deterministiske regler.
- Viktig endring: `observerCount > 0` skal ikke automatisk gi `M1(C) -1`.
  - Observatør kan bare gi reduksjon hvis input/oppdragsdata eksplisitt dokumenterer bakkebasert observasjon av overflyst område og evne til å endre flygemønster.
  - Vanlig pilot/luftromsobservatør/VLOS skal ikke automatisk redusere fGRC.
- M2/fallskjerm skal bare gi reduksjon hvis det finnes konkret dokumentert energi-/fallskjermsystem, ikke som antakelse.

4. Beregn fGRC deterministisk
- `fGRC = iGRC + total_reduction` etter faste regler.
- M1-begrensningen skal håndheves: fGRC kan ikke reduseres under tabellverdien for kontrollert bakkeområde for samme drone-/hastighetsklasse.
- Hvis ingen dokumenterte mitigeringer finnes, blir fGRC lik iGRC.

5. Overskriv AI-output før lagring
- Etter at AI har svart, setter koden alltid disse feltene på nytt:
  - `ground_risk_analysis.igrc`
  - `ground_risk_analysis.fgrc`
  - `ground_risk_analysis.total_reduction`
  - `ground_risk_analysis.mitigations`
  - `igrc_reasoning`
  - `fgrc_reasoning`
  - populasjonsfeltene fra SSB 250 m
- Dermed blir visningen, PDF og lagret analyse konsistent selv om modellen svarer litt forskjellig.

6. Gjør UI/PDF tydeligere på hva som er beregnet vs AI-vurdert
- I bakkerisiko-blokken vises en kort «Systemberegnet»/«Deterministisk beregnet» indikasjon.
- Vis tabellgrunnlaget tydelig:
  - dimensjonsklasse
  - hastighetsklasse
  - befolkningsklasse
  - iGRC-resultat
  - dokumenterte reduksjoner
  - fGRC-resultat
- PDF-eksporten skal vise samme forklaring.

7. Legg inn logging/verifikasjon
- Edge function logger beregningslinjen, f.eks.:
  - `GRC deterministic: cd<=1m, speed<=25m/s, population>1500 => iGRC=5, reductions=0, fGRC=5`
- Etter implementering verifiseres TypeScript/Deno-sjekk.

Forventet resultat:
- Tre identiske risikovurderinger på «rikard kveldsflyging» skal få samme iGRC/fGRC hver gang.
- En observatør/pilot skal ikke tilfeldig gi `-1`.
- Reduksjoner gis bare når de er dokumentert og regelmessig gyldige.
- AI kan fortsatt skrive en vurdering, men kan ikke endre selve iGRC/fGRC-tallet.