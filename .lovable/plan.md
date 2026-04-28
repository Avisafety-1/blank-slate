Du har rett: de siste endringene har blandet to ulike formål.

Slik koden står nå er `computeAdjacentAreaDensity()` endret til å bruke høyeste 250 m-rute × 16 som `avgDensity`, og derfor havner eksempelet ditt på `18 160 pers/km²` og kategori `<50 000 pers/km²`. Det er feil for selve «Tilstøtende område»-vurderingen slik vi hadde den før.

Historikken viser at før denne runden var tilstøtende område forklart og brukt slik:

```text
SSB 250 m-ruter -> total befolkning i tilstøtende donut
Tilstøtende areal km² -> total befolkning / areal
Gjennomsnittlig tetthet -> SORA-kategori (<50, <500, <5 000, <50 000, No upper limit)
```

Altså: for UA `<8 m` kan den beregnede gjennomsnittstettheten havne i kategorien `<50 pers/km²`, `<500 pers/km²`, osv. Det er ikke en fast grense på 50 for alle tilfeller; det er første/laveste kategori hvis gjennomsnittet er under eller lik 50. I skjermbildet ditt er totalen `185 948 / 219.5 km² = 847.3 pers/km²`, som normalt skal gi kategori `<5 000 pers/km²`, ikke `<50 000 pers/km²`.

Plan for å rette dette:

1. Skille «SORA-volum/buffersoner» og «Tilstøtende område» tydelig
   - SORA-volum/buffersoner:
     - beholder pådriver-logikken: høyeste SSB 250 m-rute som berører/overlapper rute eller buffersoner × 16.
     - dette brukes til kartvisualisering og «Pådriver»-label på kartet.
   - Tilstøtende område:
     - går tilbake til gjennomsnittsberegning i donut-området utenfor bakkerisikobuffer og ut til adjacent radius.
     - `avgDensity = totalPopulation / adjacentAreaKm2`.
     - ikke bruke høyeste celle som `avgDensity` her.

2. Rette `computeAdjacentAreaDensity()`
   - Beholde robust tiled SSB-henting og inkluderende polygonfilter.
   - Beholde filtreringen til kun tilstøtende område:
     - innenfor ytre tilstøtende geometri
     - utenfor indre SORA-volum/bakkerisikobuffer
   - Endre tilbake:
     - `avgDensity = summedDensity`
     - `populationDensityCategory = getPopulationDensityCategory(avgDensity, uaSize)`
     - `threshold = getDensityThreshold(populationDensityCategory)`
   - Beholde `maxDensityCell` kun som ekstra informativ verdi, ikke som grunnlag for containment for tilstøtende område.

3. Oppdatere tekstene i «Tilstøtende»-panelet
   - «Gj.snitt tetthet» skal vise reell gjennomsnittlig tetthet i donut-området.
   - «Grense» bør endres til «SORA-kategori» eller «Tetthetskategori» for å unngå misforståelse.
   - Statuslinjen skal si noe ala:
     - `Required containment: Low · gj.snitt 847.3 pers/km² (< 5 000 pers/km²)`
   - Forklaringslinjen skal ikke si at pådriveren bestemmer tilstøtende område. Den skal forklare:
     - sum innbyggere
     - areal
     - gjennomsnitt
     - valgt SORA-kategori
   - «Høyeste tetthet langs ruten» kan enten fjernes fra Tilstøtende-panelet eller merkes tydelig som «Kartpådriver / høyeste 250 m-rute» slik at den ikke forveksles med gjennomsnittsgrunnlaget.

4. Oppdatere SORA 250 m-kartlaget uten å endre tilstøtende-beregningen
   - Kartet kan fortsatt vise SSB-ruter for hele SORA-volum + tilstøtende dekning når «Tilstøtende» er på.
   - Kun pådriver-label skal vises på kartet, slik du ønsket.
   - Pådriveren skal fortsatt velges fra relevante SSB-ruter som berører SORA-volum/buffersonene. Hvis tilstøtende område vises, skal ruter der kunne tegnes, men ikke endre tilstøtende gjennomsnitt til høyeste celle.

5. Justere lagring/dokumentasjon ved rutesave
   - `adjacentAreaDocumentation.avgDensity` skal lagre gjennomsnittet, ikke pådriveren.
   - `maxCellPopulation`/`driver` kan fortsatt lagres som separat informasjonsfelt hvis relevant, men ikke erstatte `avgDensity`.

Tekniske filer som berøres:
- `src/lib/adjacentAreaCalculator.ts`
  - rette beregningslogikken i `computeAdjacentAreaDensity()`.
  - eventuelt tydeliggjøre `method`/`calculation`.
- `src/components/AdjacentAreaPanel.tsx`
  - justere labels/status/tekst slik at gjennomsnitt og pådriver ikke blandes.
- `src/components/SoraSettingsPanel.tsx`
  - beholde SORA-volumets pådriverstatus og antall ruter vurdert.
- `src/pages/Kart.tsx`
  - sikre at dokumentasjon lagres med riktig gjennomsnitt.
- Eventuelt `src/components/OpenAIPMap.tsx`
  - kun små justeringer hvis pådriverutvelgelse må begrenses til SORA-volum/buffer og ikke til adjacent donut.

Forventet resultat i eksempelet ditt:
- «Innbyggere funnet»: ca. `185 948`
- «Areal (donut)»: ca. `219.5 km²`
- «Gj.snitt tetthet»: ca. `847.3 pers/km²`
- «SORA-kategori»: `< 5 000 pers/km²`
- Pådriver/høyeste rute kan fortsatt vises som separat kartinformasjon: `1 135 × 16 = 18 160 pers/km²`, men den skal ikke styre tilstøtende gjennomsnittsberegning.