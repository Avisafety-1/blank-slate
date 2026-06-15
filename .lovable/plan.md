# Fix: Observatør-krav i AI-risikovurdering

## Problem
Brukeren (Breili drift) satte `observerCount = 1` i risikovurderingsdialogen, men AI returnerte likevel HARD STOP med teksten "selskapets påkrevde observatør ikke tildelt for oppdraget".

Selv om `observerCount` sendes til AI, sier prompt-regelen kun:
> OBSERVATØR: Selskapet KREVER dedikert observatør — mangler dette er det HARD STOP.

Den definerer ikke HVA "mangler" betyr. AI tolker det fritt — sannsynligvis ved å se på `mission_personnel` (ingen rad med rollen "Observatør") i stedet for `pilotInputs.observerCount`. Resultatet er en hard stop på falskt grunnlag, og en misvisende forklaring til brukeren.

## Løsning
Gjør regelen entydig i begge språkversjoner av prompten (`supabase/functions/ai-risk-assessment/prompts.ts`):

1. Knytt "observatør tilstede" eksplisitt til `pilotInputs.observerCount`.
2. HARD STOP utløses KUN hvis `observerCount < 1`.
3. Hvis `observerCount >= 1`, regnes kravet som oppfylt — uavhengig av om noen i `mission_personnel` har rollen "Observatør".
4. Hard stop-teksten skal referere til "antall observatører oppgitt i risikovurderingen er 0" (ikke "ikke tildelt for oppdraget"), slik at brukeren forstår hvilken input som telles.

## Tekniske detaljer

**Filer som endres:**
- `supabase/functions/ai-risk-assessment/prompts.ts` — linje ~143 (norsk) og ~697 (engelsk)

**Ny formulering (norsk):**
```
OBSERVATØR: Selskapet KREVER dedikert observatør. Kravet er oppfylt
hvis pilotInputs.observerCount >= 1. HARD STOP utløses KUN hvis
pilotInputs.observerCount === 0. Ikke baser deg på mission_personnel
for denne sjekken. Hvis hard stop utløses, skriv: "Antall observatører
oppgitt i risikovurderingen er 0 — selskapet krever minst én."
```

**Tilsvarende på engelsk** rundt linje 697 (samme regel, samme presisjon).

## Ikke endret
- Frontend (`RiskAssessmentDialog.tsx`) — `observerCount` sendes allerede korrekt.
- Selve `mission_personnel`-koblingen vurderes ikke nå (eget tema fra forrige samtale).
- Andre hard-stop-regler.

## Verifisering
Etter deploy: kjør risikovurdering med `observerCount = 1` på et oppdrag uten observatør i `mission_personnel`, og bekreft at HARD STOP for observatør IKKE utløses.
