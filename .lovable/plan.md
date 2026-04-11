

# Diagnose: Hvorfor vises ikke AirRiskAnalysis-seksjonen

## Sannsynlig årsak

Koden er korrekt implementert -- `air_risk_analysis` sendes fra AI-prompten, lagres i `ai_analysis`-kolonnen, og vises i frontend via `AirRiskAnalysisSection`. Men:

1. **Eksisterende vurderinger mangler feltet**: Vurderinger som ble kjørt FØR edge function ble oppdatert har ikke `air_risk_analysis` i sin `ai_analysis` JSON. Når du ser på en gammel vurdering, er feltet `undefined` og seksjonen skjules.

2. **Edge function muligens ikke redeployet**: Loggene viser ingen referanse til AEC, noe som tyder på at den oppdaterte funksjonen kanskje ikke ble deployet korrekt etter siste endring.

## Plan

### Steg 1: Re-deploye edge function
Sikre at `ai-risk-assessment` edge function er deployet med den nyeste koden som inkluderer AEC/ARC/TMPR-prompten.

### Steg 2: Legge til debug-logging
Legge til en console.log i edge function som logger om `air_risk_analysis` ble returnert av AI-en:

```typescript
console.log('Air risk analysis present:', !!aiAnalysis.air_risk_analysis);
```

### Steg 3: Kjøre ny risikovurdering
Etter redeployment, kjøre en **ny** risikovurdering på et oppdrag for å verifisere at `air_risk_analysis` returneres og vises i UI.

### Filer som endres
| Fil | Endring |
|-----|---------|
| `supabase/functions/ai-risk-assessment/index.ts` | Legge til debug-logging for air_risk_analysis |

