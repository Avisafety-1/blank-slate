

## Tydelig godkjenningsstatus i AI SORA-resultatet

### Hva bygges
Etter at AI SORA-vurderingen er fullført, skal resultatet tydelig vise om oppdraget ble **automatisk godkjent**, **krever manuell godkjenning**, eller om SORA-basert godkjenning ikke er aktivert. Informasjonen vises som et fremtredende banner i `RiskScoreCard`, rett under eventuell HARD STOP-boks.

### Tekniske endringer

**1. Edge function — returnere godkjenningsdetaljer (`ai-risk-assessment/index.ts`)**
Utvid response-objektet med mer kontekst enn bare `autoApproved`:
- `approvalStatus`: `'approved'` | `'not_approved'` | `null` (null = ikke aktivert)
- `approvalReason`: kort tekst som forklarer hvorfor (f.eks. "Score 8.2 >= terskel 7.0", "Hardstop utløst", "Score 5.1 < terskel 7.0")
- `approvalThreshold`: den konfigurerte terskelverdien

**2. RiskScoreCard — nytt banner (`RiskScoreCard.tsx`)**
Legg til nye props: `approvalStatus`, `approvalReason`, `approvalThreshold`.
Vis et banner mellom HARD STOP-boksen og Mission Overview:
- **Godkjent**: Grønn boks med CheckCircle-ikon: "Oppdraget ble automatisk godkjent — AI-score [X] oppfyller terskel [Y]"
- **Krever godkjenning**: Oransje/gul boks med AlertTriangle: "Oppdraget krever manuell godkjenning — [grunn]"

**3. RiskAssessmentDialog — sende data videre**
Lagre `approvalStatus`/`approvalReason`/`approvalThreshold` fra response i `currentAssessment` og pass dem til `RiskScoreCard`.

### Filer som endres
1. `supabase/functions/ai-risk-assessment/index.ts` — utvid response med approvalStatus/reason/threshold
2. `src/components/dashboard/RiskScoreCard.tsx` — nytt godkjenningsbanner
3. `src/components/dashboard/RiskAssessmentDialog.tsx` — pass nye props

