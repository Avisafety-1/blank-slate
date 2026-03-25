

## Fix: SORA terskel 0 ignoreres — default til 7

### Problem
I `ai-risk-assessment/index.ts` linje 1187:
```typescript
const threshold = Number(soraApprovalConfig.sora_approval_threshold) || 7.0;
```
`Number(0)` er `0`, som er falsy i JavaScript. `||`-operatoren faller gjennom til `7.0`. Så terskel 0 behandles som 7.

### Fix
Bytt `||` til `??` (nullish coalescing) som kun faller gjennom ved `null`/`undefined`:
```typescript
const threshold = Number(soraApprovalConfig.sora_approval_threshold) ?? 7.0;
```

Samme sjekk bør gjøres for `overallScore` på linjen over — `?? 0` i stedet for eventuell `|| 0`.

### Fil som endres
- `supabase/functions/ai-risk-assessment/index.ts` — én linje, bytt `||` til `??`

