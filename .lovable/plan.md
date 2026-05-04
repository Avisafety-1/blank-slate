# Fiks: Auto-godkjenning respekterer ikke propagering fra morselskap

## Problem
Oppdraget i Norconsults underavdeling fikk score 8.0, men ble ikke auto-godkjent. Årsaken er at edge-funksjonen `ai-risk-assessment` leser SORA-konfig direkte fra underavdelingens egen rad i `company_sora_config`, og ignorerer `propagate_sora_approval`-flagget på morselskapet. Resten av UI-en bruker RPC-en `get_effective_sora_approval_config` som håndterer arv korrekt — auto-godkjenningskoden gjør det ikke.

## Løsning
Endre auto-godkjenningsblokken i `supabase/functions/ai-risk-assessment/index.ts` (linje ~1962-2001) til å bruke RPC-en `get_effective_sora_approval_config` i stedet for direkte tabelloppslag.

### Endring
Erstatt:
```ts
const { data: soraApprovalConfig } = await supabase
  .from('company_sora_config')
  .select('sora_based_approval, sora_approval_threshold, sora_hardstop_requires_approval')
  .eq('company_id', companyId)
  .maybeSingle();

if (soraApprovalConfig?.sora_based_approval && missionId) { ... }
```

Med:
```ts
const { data: effective } = await supabase
  .rpc('get_effective_sora_approval_config', { _company_id: companyId });

const cfg = effective?.config ?? {};
if (cfg.sora_based_approval && missionId) { ... }
```

Resten av logikken (terskel, hardstop, oppdatering av `missions.approval_status`) forblir uendret.

## Verifisering
- Re-kjør AI-risikovurdering på det aktuelle oppdraget i Norconsults underavdeling — det skal nå auto-godkjennes når score ≥ terskel.
- Sjekk edge-funksjonsloggene for `SORA auto-approval: APPROVED ...`.
- Bekreft at underavdelinger uten propagering fortsatt bruker egen konfig (RPC-en returnerer egen rad når `propagate_sora_approval = false`).
