

# Plan: Forbedre kvaliteten på "Foreslått konklusjon"

## Problemet
AI-ens `summary`-felt (vist som "Foreslått konklusjon") inneholder feilaktige påstander som:
- Nevner duggpunkt-bekymring når analysen selv sier differansen er tilfredsstillende (10°C > 4°C)
- Nevner pilothviletid som aldri er vurdert i analysen
- Generelt "hallusinerer" bekymringer som ikke finnes i de faktiske kategori-vurderingene

## Løsning
Legge til eksplisitte regler i system-prompten for hvordan `summary` skal skrives.

### Endring i `supabase/functions/ai-risk-assessment/index.ts`

Legge til en ny seksjon i `systemPrompt` (før `### RESPONS-FORMAT`):

**REGLER FOR SUMMARY (Foreslått konklusjon):**
- Summary SKAL kun omtale bekymringer som faktisk er reflektert i kategori-scorene og concerns-listene
- Summary MÅ IKKE nevne risikoer som analysen selv har vurdert som tilfredsstillende/OK
- Eksempel: Hvis duggpunkt-differansen er >5°C og weather-kategorien sier "tilfredsstillende", skal summary IKKE nevne duggpunkt som en bekymring
- Summary MÅ IKKE nevne temaer som ikke er analysert (f.eks. "hviletid" hvis dette ikke er i datagrunnlaget)
- Summary skal kort oppsummere: (1) hovedbeslutning (go/caution/no-go), (2) de 2-3 viktigste reelle bekymringene fra concerns, (3) de viktigste positive faktorene
- Summary skal være konsistent med recommendation-feltet og overall_score

## Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/ai-risk-assessment/index.ts` | Ny prompt-seksjon med regler for summary-kvalitet |

Deploy av edge function nødvendig.

