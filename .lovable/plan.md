

## Fix: Civil twilight HARD STOP virker ikke i AI SORA

### Problem
Prompten forteller AI-en å "vurdere oppdragets planlagte tidspunkt mot skumringstidene", men:
1. Den sier ikke eksplisitt hva klokken er for oppdraget — AI-en må lete gjennom contextData selv
2. AI-en gjør ingen deterministisk sammenligning — den "tolker" fritt og ignorerer det ofte
3. Prompten burde gjøre sammenligningen i kode og gi AI-en et klart svar: "oppdraget er UTENFOR skumringstid → HARD STOP"

### Løsning
Gjør sammenligningen **deterministisk i kode** (i edge function), ikke overlat det til AI-en.

### Endring i `supabase/functions/ai-risk-assessment/index.ts`

**1. Utvid civil twilight-beregningen (linje ~645-674):**
- Etter at `dawnUTC` og `duskUTC` er beregnet, sammenlign med oppdragets `tidspunkt`
- Hvis `mission.tidspunkt` har en tid-komponent, sjekk om den faller utenfor dawn–dusk
- Legg til et nytt felt: `civilTwilightViolation: boolean` og `missionTimeFormatted: string`

```typescript
let civilTwilightViolation = false;
let missionTimeFormatted = '';

if (civilTwilightInfo && mission.tidspunkt) {
  const missionTime = new Date(mission.tidspunkt);
  missionTimeFormatted = missionTime.toLocaleTimeString('no-NO', { 
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' 
  });
  // Compare actual UTC times
  if (missionTime < dawnUTC || missionTime > duskUTC) {
    civilTwilightViolation = true;
  }
}
```

**2. Oppdater prompten (linje ~841):**
Erstatt den nåværende vage instruksjonen med en eksplisitt, deterministisk melding:

- Hvis `civilTwilightViolation === true`:
  `"SIVIL SKUMRING — HARD STOP: Oppdraget er planlagt kl. {missionTime} som er UTENFOR sivil skumring (dawn: {dawn}, dusk: {dusk}). Dette er et BRUDD og SKAL gi recommendation='no-go' og hard_stop_triggered=true."`

- Hvis `civilTwilightViolation === false`:
  `"SIVIL SKUMRING: OK — Oppdraget kl. {missionTime} er innenfor sivil skumring (dawn: {dawn}, dusk: {dusk})."`

- Hvis ingen tidspunkt er satt på oppdraget:
  `"SIVIL SKUMRING: Selskapet krever flyging innenfor sivil skumring (dawn: {dawn}, dusk: {dusk}), men oppdraget har ingen planlagt tid. ADVARSEL i rapporten."`

**3. Legg til i contextData (~linje 793):**
```typescript
civilTwilight: civilTwilightInfo ? {
  ...civilTwilightInfo,
  violation: civilTwilightViolation,
  missionTime: missionTimeFormatted
} : null,
```

### Hvorfor dette fikser problemet
AI-en slipper å gjette — koden har allerede sjekket og gir AI-en et klart "HARD STOP" eller "OK". Samme mønster som brukes for flyhøyde-grensen.

