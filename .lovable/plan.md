Plan for implementering:

1. Oppdatere datamodellen for SORA-innstillinger
- Utvide `SoraSettings` med kinematiske verdier fra SORA-buffersoner som trengs videre:
  - `droneId`
  - `characteristicDimensionM` (CD)
  - `groundSpeedMps` (V0)
- Når brukeren velger drone og beregner SORA-buffersoner, lagres disse verdiene i `soraSettings` slik at «Tilstøtende områder» automatisk kan bruke samme UA.

2. Automatisk valg av UA Size
- UA Size skal ikke være et fritt standardvalg brukeren må fylle ut på nytt.
- Systemet beregner foreslått UA Size fra verdiene brukt i SORA-buffersoner:
  - CD < 1 m og V0 < 25 m/s → `< 1 m UA (< 25 m/s)`
  - CD < 3 m og V0 < 35 m/s → `< 3 m UA (< 35 m/s)`
  - CD < 8 m og V0 < 75 m/s → `< 8 m UA (< 75 m/s)`
  - CD < 20 m og V0 < 125 m/s → `< 20 m UA (< 125 m/s)`
  - CD < 40 m og V0 < 200 m/s → `< 40 m UA (< 200 m/s)`
- For `< 3 m UA` må brukeren fortsatt kunne angi om «shelter» er relevant i tilstøtende område, fordi det ikke kan utledes sikkert fra dronevalget.
- UI viser automatisk valgt UA Size som en forklaring, med mulighet for manuell overstyring hvis nødvendig.

3. Implementere CAA containment-matrisen
- Erstatte dagens enkle «containment-nivå terskel»-logikk med CAA/Luftfartstilsynet sin containment-logikk fra `containment.html`:
  - UA Size
  - SAIL I–VI
  - gjennomsnittlig befolkningstetthet i tilstøtende område
  - outdoor assemblies innen 1 km fra operasjonsvolum
  - resultat: `Low`, `Medium`, `High` eller `Out of scope`
- Matrisen legges i `src/lib/adjacentAreaCalculator.ts` som lokal typed konstant, slik at appen ikke er avhengig av ekstern CAA-side i runtime.

4. Koble SSB-resultatet til riktig tetthetskategori
- Fortsette å hente SSB 250 m befolkningsrutenett via eksisterende edge function.
- Beregne faktisk gjennomsnittlig tetthet i «donut»-området som i dag.
- Mappe beregnet tetthet til CAA-kategorier:
  - `< 50`
  - `< 500`
  - `< 5 000`
  - `< 50 000`
  - `No upper limit`
- Kun vise de tetthetskategoriene som er gyldige for valgt UA Size, slik CAA-kalkulatoren gjør.

5. SAIL-felt
- Legge inn SAIL I–VI i «Tilstøtende områder»-panelet.
- Hvis ruteplanleggingen kommer fra et eksisterende oppdrag eller har `missionId`, forsøker vi å hente SAIL fra `mission_sora.sail` og forhåndsutfylle feltet.
- Hvis SAIL ikke finnes, brukes en tydelig standard/placeholder og brukeren kan velge manuelt.

6. Outdoor assemblies
- Legge inn valg for «Outdoor assemblies innen 1 km fra OPS volume»:
  - `< 40 k`
  - `40 k til 400 k`
  - `> 400 k`
- Standard settes til `< 40 k`, men feltet vises tydelig som operativ vurdering brukeren må bekrefte.

7. Resultatvisning og fargekoding
- Erstatte dagens `OK/OVER` med «Required containment: Low/Medium/High/Out of scope».
- Headeren «Tilstøtende» fargekodes etter resultat:
  - Low: grønn
  - Medium: gul/oransje
  - High: rød
  - Out of scope: rød/destruktiv
- Panelet viser fortsatt radius, areal, innbyggere og gjennomsnittlig tetthet, men statusen handler nå om nødvendig containment, ikke bare pass/fail mot en manuelt valgt terskel.

8. Kart-siden og dataflyt
- Oppdatere `Kart.tsx` slik at valgt drone, maks hastighet og CD fra SORA-buffersoner sendes til `AdjacentAreaPanel`.
- Sørge for at lagrede ruter får med de nye SORA-verdiene, slik at beregningen er konsistent når ruten åpnes igjen.

Tekniske filer som endres:
- `src/types/map.ts`
- `src/components/SoraSettingsPanel.tsx`
- `src/components/AdjacentAreaPanel.tsx`
- `src/lib/adjacentAreaCalculator.ts`
- `src/pages/Kart.tsx`

Viktig avgrensning:
- SSB-datagrunnlaget og geometriberegningen beholdes som i dag.
- Det som endres er beslutningslogikken: beregnet tetthet + UA Size + SAIL + outdoor assemblies gir nødvendig containment etter CAA SORA 2.5-matrisen.