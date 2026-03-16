

## Plan: Avdelinger arver moderselskapets innstillinger

### Problem
Når en bruker er i en avdeling (child company), leser systemet innstillinger (`stripe_exempt`, `dji_flightlog_enabled`, abonnement) fra avdelingens egen rad i `companies`/`company_subscriptions`. Avdelinger har typisk ingen egne innstillinger, så alt returnerer `false`/`null`.

### Løsning
Legg til en "resolve to parent"-logikk i to steder: AuthContext (frontend) og check-subscription (edge function).

### Endringer

#### 1. `src/contexts/AuthContext.tsx` — fetchUserInfo
- Etter å ha hentet brukerens company, sjekk om `parent_company_id` finnes (legg til i select-query).
- Hvis ja, hent moderselskapets `stripe_exempt` og `dji_flightlog_enabled` og bruk de verdiene i stedet.
- Legg til `parent_company_id` i select: `companies (id, navn, selskapstype, adresse_lat, adresse_lon, dji_flightlog_enabled, dronelog_api_key, stripe_exempt, parent_company_id)`
- Logikk: Hvis `company.parent_company_id` finnes → hent parent company → bruk parent's `stripe_exempt` og `dji_flightlog_enabled`.

#### 2. `supabase/functions/check-subscription/index.ts`
- Etter å ha hentet brukerens `company_id`, sjekk om selskapet har `parent_company_id`.
- Hvis ja, bruk `parent_company_id` for oppslag i `company_subscriptions` og `billing_user_id`-sjekk.
- Dette sikrer at avdelingsbrukere arver moderselskapets abonnement, plan, addons og seat count.

#### 3. `supabase/functions/create-checkout/index.ts`
- Samme logikk: resolve til parent company for checkout, slik at abonnementet opprettes på moderselskapet.

#### 4. `supabase/functions/change-plan/index.ts` og `manage-addon/index.ts`
- Resolve til parent company slik at planendringer og addon-håndtering skjer på moderselskapet.

### Teknisk mønster
Alle steder bruker samme mønster:
```typescript
// Resolve to parent company if child
let effectiveCompanyId = companyId;
const { data: comp } = await supabase.from('companies').select('parent_company_id').eq('id', companyId).single();
if (comp?.parent_company_id) effectiveCompanyId = comp.parent_company_id;
```

### Hva dette IKKE endrer
- RLS-policyer (allerede korrekte via `get_user_visible_company_ids`)
- Skriveoperasjoner (data opprettes alltid i brukerens aktive company)
- Avdelingens egne felt som `navn`, `adresse`, `org_nummer` forblir uavhengige

