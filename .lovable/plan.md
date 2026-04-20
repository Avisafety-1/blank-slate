

## Plan: Propagering av «Godkjenning basert på SORA» til avdelinger

### Mål
Legge til en «Gjelder for alle underavdelinger»-bryter ved siden av «Godkjenning basert på SORA» i `CompanySoraConfigSection`. Når morselskapet aktiverer denne, skal avdelingene arve både selve flagget (`sora_based_approval`) og terskelverdiene (`sora_score_threshold`, evt. andre relaterte felt i `company_sora_config`) i runtime — ikke som en engangskopi.

### Diagnose
- `company_sora_config` har i dag `sora_based_approval` + tersklene per selskap.
- `useSoraApprovalEnabled` leser kun avdelingens egen rad → avdelinger får aldri morselskapets innstilling.
- `companies`-tabellen har allerede mønsteret `propagate_*` (deviation_report, flight_alerts, osv.) — vi følger samme mønster.

### Endringer

**1. Database-migrasjon**
- Legg til kolonne `companies.propagate_sora_approval boolean default false`.
- Lag SECURITY DEFINER RPC `get_effective_sora_approval_config(_company_id uuid)` som:
  - Slår opp `parent_company_id` + parent's `propagate_sora_approval`.
  - Hvis avdeling og parent propagerer → returner parent's `company_sora_config`-rad (sora_based_approval, sora_score_threshold, evt. andre relevante felt).
  - Ellers → returner egen rad.
  - Adgangssjekk via `get_user_visible_company_ids(auth.uid())`.
  - GRANT EXECUTE til `authenticated`.

**2. UI: `CompanySoraConfigSection.tsx`**
- Ved siden av Switch for «Godkjenning basert på SORA», legg til en sekundær Switch «Gjelder for alle underavdelinger» (kun synlig for morselskap, samme mønster som andre propagate-toggles).
- Lagre til `companies.propagate_sora_approval`.
- Når propagering er på i avdelings-visning: vis innstillingene som «Arvet fra moderavdeling — kun lesetilgang» (disabled inputs), tilsvarende deviation-categories-mønsteret.

**3. UI: `useSoraApprovalEnabled.ts`**
- Bytt direkte SELECT mot `company_sora_config` til `supabase.rpc("get_effective_sora_approval_config", { _company_id })`.
- Behold cache + realtime-invalidering (lytte også på endringer i parent's rad er nice-to-have, men minimumsløsning: invalider på lokal endring + manuell refresh holder, siden RPC-en alltid leser ferskt).

**4. UI: andre forbruksteder**
- Søk etter andre lesere av `company_sora_config.sora_based_approval` / `sora_score_threshold` (f.eks. mission approval-logikk i `MissionsSection`/`useOppdragData`/edge functions). Bytt disse til samme RPC slik at terskel og auto-godkjenning også arves.

### Filer som endres
- Ny migrasjon: kolonne `propagate_sora_approval` + RPC `get_effective_sora_approval_config`.
- `src/components/admin/CompanySoraConfigSection.tsx` (ny propagate-toggle, readonly-modus for avdeling).
- `src/hooks/useSoraApprovalEnabled.ts` (RPC-kall).
- Andre lesere av SORA-godkjenningskonfig identifisert under utvikling (oppdateres til RPC).

### Resultat
Morselskapet kan slå på «Godkjenning basert på SORA» + «Gjelder for alle underavdelinger» én gang, og alle avdelinger bruker samme regler og terskler automatisk — uten manuell kopi og uten at avdelings-admin kan endre dem lokalt.

