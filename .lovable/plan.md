

## Plan: Oppdater alle Stripe-IDer til live produksjons-IDer

Alle hardkodede price/product IDer i kodebasen peker på sandbox. Disse må erstattes med de nye live-IDene.

### Filer som endres

**1. `src/config/subscriptionPlans.ts`**
- Oppdater `priceId` og `productId` for alle 3 planer og 3 addons
- Oppdater `PRICE_TO_PLAN` og `ADDON_PRICE_IDS` mappingene

**2. `supabase/functions/create-checkout/index.ts`**
- Oppdater `PLAN_PRICES` og `ADDON_PRICES` med nye live price IDer

**3. `supabase/functions/check-subscription/index.ts`**
- Oppdater `PRICE_TO_PLAN` og `ADDON_PRICE_IDS` med nye live price IDer
- Behold legacy `price_1TAvyMRrLM8xOFbkg986ibK4` som fallback

**4. `supabase/functions/stripe-webhook/index.ts`**
- Oppdater `PRICE_TO_PLAN` og `ADDON_PRICE_IDS` med nye live price IDer
- Behold legacy fallback

**5. `supabase/functions/update-seats/index.ts`**
- Oppdater `PLAN_PRICE_IDS` settet med nye live price IDer
- Behold legacy fallback

**6. `.lovable/plan.md`**
- Oppdater dokumentasjon med korrekte live-IDer

### Nye live-IDer som brukes

| Plan | Price ID |
|------|----------|
| Starter | `price_1TB9TARrLM8xOFbkzV267Soh` |
| Grower | `price_1TB9TfRrLM8xOFbkV1ac0aY5` |
| Professional | `price_1TB9DARrLM8xOFbkVWT7zgGW` |
| SORA Admin | `price_1TB8tURrLM8xOFbk2fX9o05U` |
| DJI | `price_1TB9IBRrLM8xOFbkijdJUsL7` |
| ECCAIRS | `price_1TB9JCRrLM8xOFbklvsgEyiV` |

Edge-funksjonene deployes automatisk etter endring.

