Jeg har sjekket vår nåværende SORA-bufferlogikk mot Luftfartstilsynets SORA 2.5-kalkulator for Contingency Volume.

Konklusjon: Nei, vår automatiske «Foreslått SORA-buffer»-kalkulator er ikke riktig som SORA 2.5-beregning. Den er en grov heuristikk basert på dronetype, vekt, høyde, vind og multiplikatorer. Den matcher ikke formelen i Luftfartstilsynets kalkulator.

Viktig nyanse: Selve kart-renderingen av buffersonene er konseptuelt riktig ved at den tegner lagene som avstander fra ruten:

```text
Rute / Flight Geography
+ Flight Geography Area
+ Contingency Area
+ Ground Risk Buffer
```

Problemet ligger i hvordan appen foreslår tallene for Contingency og Ground Risk, ikke primært i hvordan sonene tegnes.

## Hvordan vi regner i dag

I `src/lib/soraBufferCalculator.ts` bruker vi faste basisverdier:

```text
Multirotor: contingency 20 m, ground risk 50 m
Fixed wing: contingency 40 m, ground risk 80 m
VTOL: contingency 30 m, ground risk 60 m
Helicopter: contingency 35 m, ground risk 70 m
```

Deretter justeres tallene med multiplikatorer for MTOW, høyde, BVLOS/VLOS, containment, vind, hastighet, fallskjerm og FTS. Dette gir praktiske forslag, men det er ikke SORA 2.5-metoden fra CAA/Luftfartstilsynet.

## Hvordan Luftfartstilsynets kalkulator regner

Fra `https://training.caa.no/SORA-2.5-calculator/contingency_volume.html` bruker kalkulatoren blant annet:

```text
SCV = SGNSS + SPos + SMap + SR + SCM
SR  = V0 × tR
```

For standard multirotor:

```text
SCM = V0² / (2 × g × tan(theta))
HCM = V0² / (2 × g)
HR  = V0 × 0.707 × tR
HCV = HFG + HAM + HR + HCM
```

For standard fixed wing:

```text
SCM = V0² / (g × tan(bank angle))
HCM = (V0² / g) × 0.3
```

For Parachute/FTS contingency:

```text
SCM = V0 × tP
HCM = V0 × 0.707 × tP
```

Ground Risk Buffer beregnes separat når GRB er aktivert, med metodevalg:

```text
1:1 rule:       SGRB = HCV + CD/2
Ballistic:      SGRB = V0 × sqrt((2 × HCV) / g) + CD/2
Glide:          SGRB = HCV × glideRatio + CD/2
Drift/parachute: SGRB = (HCV / descentSpeed) × windSpeed + CD/2
```

I tillegg advarer kalkulatoren om at Flight Geography-dimensjoner må være minst `3 × CD`.

## Plan for å gjøre vår kalkulator korrekt

1. Erstatt den heuristiske beregningen i `soraBufferCalculator.ts` med en SORA 2.5-formelbasert kalkulator som følger Luftfartstilsynets Contingency Volume-logikk.

2. Utvid input-parametere i SORA-panelet i ruteplanleggeren:
   - Maks bakkehastighet `V0` (inkludert vind, slik CAA-kalkulatoren beskriver)
   - Reaksjonstid `tR`
   - Maks pitch/bank-vinkel
   - Altimetry error `HAM`
   - GNSS error `SGNSS`
   - Position hold error `SPos`
   - Map error `SMap`
   - Characteristic Dimension `CD`
   - Contingency-metode: Standard eller Parachute/FTS
   - Deployment time `tP` når Parachute/FTS er valgt
   - GRB på/av og GRB-metode: 1:1, Ballistic, Glide, Drift/Parachute
   - Glide ratio, vindhastighet og descent speed der disse metodene krever det

3. Behold kartets eksisterende visuelle soner, men fyll dem med korrekt beregnede verdier:
   - `contingencyDistance = SCV`
   - `contingencyHeight = HCV - HFG`
   - `groundRiskDistance = SGRB`

4. Endre UI-tekst fra «Foreslått SORA-buffer» til noe mer presist, for eksempel «SORA 2.5-beregning», og vis detaljene:

```text
Reaction (SR)
Maneuver (SCM)
Vertical reaction (HR)
Vertical maneuver (HCM)
CV buffer (SCV)
Total ceiling (HCV)
Ground Risk Buffer (SGRB)
```

5. Legg inn validering/advarsler:
   - Flight Geography bør være minst `3 × CD`
   - Maks bakkehastighet bør inkludere vind
   - Drift/parachute-vind under ca. 3 m/s bør markeres som lite realistisk, tilsvarende CAA-kalkulatoren
   - Fixed wing bør ikke bruke ballistic-metoden, og multirotor bør ikke bruke glide-metoden, slik CAA-kalkulatoren gjør

6. Bruk dronekatalogen der vi har data, men la brukeren overstyre verdier manuelt. Per nå ser dronekatalogen ut til å ha vekt, maks vind og enkelte spesifikasjoner, men ikke komplett `characteristic_dimension_m` eller maks bakkehastighet for alle modeller. Derfor bør UI-en alltid vise beregningsparametrene og ikke skjule dem bak automatiske antakelser.

7. Legg til små enhetstester for kalkulatoren med referanseeksempel fra Luftfartstilsynets standardverdier:

```text
Multirotor
V0 = 15 m/s
TR = 1.5 s
theta = 30°
HFG = 120 m
HAM = 1 m
SGNSS = 5 m
SPos = 2 m
SMap = 0 m
Forventet SCV ≈ 49.4 m
Forventet HCV ≈ 148.4 m
```

## Filer som må endres

- `src/lib/soraBufferCalculator.ts`
- `src/components/SoraSettingsPanel.tsx`
- eventuelt `src/types/map.ts` hvis vi ønsker å lagre flere beregningsparametere sammen med ruten
- testfil for kalkulatoren

## Visuell effekt

Ja, dette gir en visuell og funksjonell endring i ruteplanleggerens SORA-panel:

- Flere beregningsfelt blir tilgjengelige.
- Resultatboksen viser faktiske SORA 2.5-detaljer i stedet for grove forslag.
- Standardverdiene vil kunne gi andre bufferavstander enn i dag. For eksempel gir CAA-standardeksempelet `SCV ≈ 49.4 m`, mens vår nåværende heuristikk ofte runder til andre tall avhengig av dronetype/vekt/vind.
- Kartsonene vil fortsatt tegnes på samme måte, men med mer regulatorisk riktige avstander.