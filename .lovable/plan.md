

# Plan: Forbedre AI-risikovurderingen med SORA ARC/AEC og TMPR

## Bakgrunn
Den nåværende AI-risikovurderingen har allerede ARC-felter (arc_initial, arc_residual) og luftromsdata, men den mangler den strukturerte AEC-klassifiseringen, strategiske mitigeringslogikken, og TMPR-kravtabellen som EASA SORA krever. Bildene du lastet opp viser det formelle AEC→ARC-flytdiagrammet og TMPR-kravene for Detect/Decide/Command/Execute/Feedback Loop.

## Hva skal forbedres

### 1. Utvide AI-prompten med AEC/ARC-logikk (Edge Function)
Legge til en ny seksjon i system-prompten i `ai-risk-assessment/index.ts` som instruerer AI-en til å:

- **Bestemme AEC** (Air Encounter Category 1-12) basert på: nærhet til lufthavn, luftromsklasse, høyde (over/under 500 ft), urbant/landlig, Mode-S/TMZ
- **Bestemme initiell ARC** (a/b/c/d) fra AEC-tabellen
- **Vurdere strategiske mitigeringer** som kan redusere ARC opptil 2 nivåer:
  - Operasjonelle restriksjoner (avgrensning, tidspunkt, eksponering)
  - Regler/luftromsstruktur (NOTAM, Ninox, klarering fra tårn) - maks 1 ekstra nivå, kun under 500 ft
- **Bestemme residual ARC** etter mitigeringer
- **Angi TMPR-nivå** basert på residual ARC (ARC-d→High, ARC-c→Medium, ARC-b→Low, ARC-a→No requirement)
- **Liste TMPR-krav** for de 5 funksjonene (Detect, Decide, Command, Execute, Feedback Loop) med konkrete anbefalinger

### 2. Utvide AI JSON-responsen
Legge til nye felter i JSON-responsstrukturen:

```json
{
  "air_risk_analysis": {
    "aec": "AEC 10",
    "aec_reasoning": "Under 500 fot, landlig, ukontrollert luftrom",
    "initial_arc": "ARC-b",
    "strategic_mitigations_applied": [
      "NOTAM publisert 12+ timer før",
      "Elektronisk synlig via ADS-B/SafeSky",
      "Tidspunkt valgt med lav trafikkforventning"
    ],
    "residual_arc": "ARC-b",
    "tmpr_level": "Low",
    "tmpr_requirements": {
      "detect": "DAA-plan som muliggjør deteksjon av ca. 50% av trafikk",
      "decide": "Dokumentert unnvikelsesprosedyre",
      "command": "C2-link latens maks 5 sekunder",
      "execute": "Drone kan synke til sikker høyde innen 1 minutt",
      "feedback_loop": "5s oppdateringsrate, 10s latens"
    },
    "detection_recommendations": [
      "Innebygd ADS-B mottaker",
      "SafeSky for ekstra dekning",
      "Flightradar24 dekningssjekk"
    ],
    "vlos_exemption": true
  }
}
```

### 3. Utvide airspace-kategorien i scoren
Airspace-kategoriens `actual_conditions` og `concerns` skal inkludere AEC/ARC-informasjon og konkrete TMPR-anbefalinger.

### 4. Vise ARC/TMPR i frontend
Utvide `RiskScoreCard.tsx` med en ny seksjon under airspace-kategorien som viser:
- AEC-klassifisering med forklaring
- Initiell → Residual ARC (visuelt med farger: a=grønn, b=gul, c=oransje, d=rød)
- Liste over strategiske mitigeringer som er vurdert
- TMPR-nivå og krav (for BVLOS-operasjoner)
- Anbefalte deteksjonssystemer

### 5. Kontekstdata som allerede er tilgjengelig
Systemet har allerede de nødvendige inputdataene:
- Luftromsadvarsler (CTR/TIZ, 5km-soner) fra `check_mission_airspace`
- VLOS/BVLOS-status fra `pilotInputs.isVlos`
- Flyhøyde fra `pilotInputs.flightHeight`
- Observatørantall fra `pilotInputs.observerCount`
- Arealbruk (urbant/landlig) fra SSB-data
- Nærhet til flyplasser fra NOTAM/airspace-data

Ingen nye datakilder trengs -- AI-en kan utlede AEC fra eksisterende kontekstdata.

## Tekniske endringer

| Fil | Endring |
|-----|---------|
| `supabase/functions/ai-risk-assessment/index.ts` | Utvide system-prompt med AEC/ARC-tabell, strategisk mitigering, TMPR-krav. Utvide JSON-responsformat med `air_risk_analysis`-objekt. |
| `src/components/dashboard/RiskScoreCard.tsx` | Ny collapsible seksjon for ARC/TMPR under airspace-score |
| `src/components/dashboard/RiskAssessmentDialog.tsx` | Sende `air_risk_analysis` til RiskScoreCard |

## Omfang
- Ingen databaseendringer nødvendig
- Ingen nye API-kall -- bruker eksisterende data
- Endringer kun i AI-prompt, responsformat, og frontend-visning

