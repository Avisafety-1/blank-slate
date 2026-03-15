## Ny prismodell – IMPLEMENTERT

### Stripe-produkter (opprettet)
| Plan | Product ID | Price ID |
|------|-----------|----------|
| Starter (99 NOK) | prod_U9RkaanTF3DhRx | price_1TB8rSRwSSSiRYeAcdc2KWfQ |
| Grower (199 NOK) | prod_U9RloL0mDm4fAO | price_1TB8rnRwSSSiRYeAWCmvXJoP |
| Professional (299 NOK) | prod_U9Rl8Mm942NU7W | price_1TB8s3RwSSSiRYeAuD8W8KR2 |
| SORA Admin (99 NOK) | prod_U9RnvT5JMaB4V5 | price_1TB8tURrLM8xOFbk2fX9o05U |
| DJI-integrasjon (99 NOK) | prod_U9RnxOitGXYRsO | price_1TB8tlRwSSSiRYeAvnA3aHCq |
| ECCAIRS-integrasjon (99 NOK) | prod_U9Rnz6IoHvFv3G | price_1TB8tzRwSSSiRYeAFy8wFJjt |

### Implementerte filer
- `src/config/subscriptionPlans.ts` – Plan/pris-konfigurasjon
- `supabase/functions/create-checkout/index.ts` – Flerplan checkout med addons
- `supabase/functions/check-subscription/index.ts` – Selskapsbasert sjekk
- `supabase/functions/stripe-webhook/index.ts` – Synk til company_subscriptions
- `supabase/functions/customer-portal/index.ts` – Billing owner-sjekk
- `supabase/functions/update-seats/index.ts` – Automatisk seat-synk
- `src/contexts/AuthContext.tsx` – Nye felter: subscriptionPlan, subscriptionAddons, isBillingOwner, seatCount
- `src/components/SubscriptionGate.tsx` – Planvelger-UI
- `src/pages/Priser.tsx` – Tre planer + tilleggsmoduler
- `src/components/ProfileDialog.tsx` – Oppdatert abonnement-tab
- DB-migrasjon: `company_subscriptions`-tabell, `billing_user_id` på companies

### Gjenstår (oppfølging)
- Feature-gating basert på addons (SORA/DJI/ECCAIRS)
- Admin-panel: vise selskapsplan i oversikten
