

# Plan: Legge til strukturert bakkerisikoanalyse (iGRC/fGRC) i AI-risikovurderingen

## Bakgrunn
Luftrisikoanalysen (AEC/ARC/TMPR) er allerede implementert som en egen collapsible seksjon. Nå skal vi gjøre det samme for bakkerisiko, basert på EASA SORA Steg 2 og 3: iboende bakkerisiko (iGRC) og endelig bakkerisiko (fGRC) med mitigeringer M1(A), M1(B), M1(C) og M2.

Systemet har allerede tilgjengelig: SSB befolkningstetthet, SSB arealbruk, dronens klasse/vekt, flyhøyde, og SORA-bufferdata.

## Endringer

### 1. Utvide AI-prompten (Edge Function)
I `supabase/functions/ai-risk-assessment/index.ts`, legge til en ny seksjon i system-prompten:

**BAKKERISIKO — iGRC OG fGRC (EASA SORA Steg 2-3)**

Instruere AI-en til å:
- Bestemme dronens **karakteristiske dimensjon** og **maks hastighet** fra drone-data (bruk kolonnetabell for 1m/3m/8m/20m/40m)
- Beregne **iGRC-fotavtrykk** (Flight Geography + Contingency Volume + Ground Risk Buffer)
- Identifisere **høyeste befolkningstetthet** fra SSB-data (populationDensity.maxDensity) og mappe til riktig rad i iGRC-tabellen
- Slå opp **iGRC-verdi** (1-10) fra tabellen (karakteristisk dimensjon × befolkningstetthet)
- Vurdere **M1(A) Skjerming** (Low/Medium robusthet): boligområder med bygninger, MTOW <25kg
- Vurdere **M1(B) Operasjonelle restriksjoner** (Medium/High): tid/sted-begrensninger, ~90%/~99% reduksjon
- Vurdere **M1(C) Bakkeobservasjon** (Low): observatør som justerer flygemønster
- Vurdere **M2 Redusert treffenergi** (Medium/High): fallskjerm eller annen energidempning
- Beregne **fGRC** = iGRC minus reduksjoner fra tabellen (M1(A) Low=-1, Medium=-2; M1(B) Medium=-1, High=-2; M1(C) Low=-1; M2 Medium=-1, High=-2)
- Sjekke at fGRC ikke er lavere enn "Controlled ground area"-verdien i kolonnen

### 2. Utvide JSON-responsen
Nytt felt `ground_risk_analysis`:

```json
{
  "ground_risk_analysis": {
    "characteristic_dimension": "3m",
    "max_speed_category": "35 m/s",
    "population_density_band": "< 500",
    "population_density_description": "Spredt bebygd / boligområde med store tomter",
    "population_density_value": 320,
    "igrc": 5,
    "igrc_reasoning": "Drone med 3m dimensjon, 35 m/s maks hastighet, over spredt bebygd område (<500 pers/km²)",
    "mitigations": {
      "m1a_sheltering": { "applicable": true, "robustness": "Low", "reduction": -1, "reasoning": "Operasjon over boligområde med bygninger som gir skjerming, drone <25 kg" },
      "m1b_operational_restrictions": { "applicable": false, "robustness": null, "reduction": 0, "reasoning": "Ingen tid/sted-begrensninger dokumentert" },
      "m1c_ground_observation": { "applicable": true, "robustness": "Low", "reduction": -1, "reasoning": "Observatør overvåker bakkeområdet under flyging" },
      "m2_impact_reduction": { "applicable": false, "robustness": null, "reduction": 0, "reasoning": "Ingen fallskjerm eller energidempende system" }
    },
    "total_reduction": -2,
    "fgrc": 3,
    "fgrc_reasoning": "iGRC 5 redusert med -1 (M1A skjerming) og -1 (M1C bakkeobservasjon) = fGRC 3",
    "controlled_ground_area": false
  }
}
```

### 3. Ny frontend-komponent: `GroundRiskAnalysisSection.tsx`
Samme mønster som `AirRiskAnalysisSection.tsx` — collapsible seksjon som viser:
- iGRC-verdi med fargekode (1-3=grønn, 4-6=gul, 7+=rød)
- Drone dimensjon/hastighet og befolkningstetthetsbånd
- Mitigeringstabell med M1(A)/M1(B)/M1(C)/M2, robusthetsnivå og reduksjon
- iGRC → fGRC visuell progresjon
- Kontrollert bakkeområde-markering hvis relevant

### 4. Integrere i `RiskScoreCard.tsx`
Vise `GroundRiskAnalysisSection` etter `mission_complexity`-kategorien (der bakkerisiko er mest relevant).

## Tekniske endringer

| Fil | Endring |
|-----|---------|
| `supabase/functions/ai-risk-assessment/index.ts` | Ny seksjon i system-prompt med iGRC-tabell og mitigeringer. Utvide JSON-respons med `ground_risk_analysis`. |
| `src/components/dashboard/GroundRiskAnalysisSection.tsx` | Ny komponent (collapsible) for visning av iGRC/fGRC |
| `src/components/dashboard/RiskScoreCard.tsx` | Legge til `groundRiskAnalysis` prop og vise etter mission_complexity |
| `src/components/dashboard/RiskAssessmentDialog.tsx` | Sende `ground_risk_analysis` til RiskScoreCard |

## Omfang
- Ingen databaseendringer
- Bruker eksisterende SSB-data og dronedata
- Deploy av edge function nødvendig

