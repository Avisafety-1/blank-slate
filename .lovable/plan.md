

## Plan: Bevar pilot-kommentarer ved re-vurdering

### Problem
Når brukeren kjører en ny risikovurdering, nullstilles kommentarene i UI (`setCategoryComments({})` linje 264) og de sendes ikke med til edge-funksjonen. Kommentarene skal bare bli stående slik de var — som om brukeren hadde trykket «lagre kommentarer» først.

### Endringer

**1. `src/components/dashboard/RiskAssessmentDialog.tsx`**
- Fjern `setCategoryComments({})` på linje 264 — kommentarene skal bli stående i UI etter ny vurdering
- Send `categoryComments` med i request-body (`pilotComments: categoryComments`)

**2. `supabase/functions/ai-risk-assessment/index.ts`**
- Les `pilotComments` fra request-body i den vanlige flyten (linje ~1007-1024)
- Legg til `pilot_comments: pilotComments || {}` i insert-objektet

Ingen andre endringer — dette påvirker bare at kommentarene lagres og vises, akkurat som «lagre kommentarer».

