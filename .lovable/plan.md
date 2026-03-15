## Ny prismodell – IMPLEMENTERT (Live Stripe)

### Stripe Live-produkter
| Plan | Product ID | Price ID |
|------|-----------|----------|
| Starter (99 NOK) | prod_U9SNyTk1R28VOf | price_1TB9TARrLM8xOFbkzV267Soh |
| Grower (199 NOK) | prod_U9SOzBZAWkFv4m | price_1TB9TfRrLM8xOFbkV1ac0aY5 |
| Professional (299 NOK) | prod_U9S7NAHDDleuNG | price_1TB9DARrLM8xOFbkVWT7zgGW |
| SORA Admin (99 NOK) | prod_U9RnvT5JMaB4V5 | price_1TB8tURrLM8xOFbk2fX9o05U |
| DJI-integrasjon (99 NOK) | prod_U9SCO6vjcZPjBb | price_1TB9IBRrLM8xOFbkijdJUsL7 |
| ECCAIRS-integrasjon (99 NOK) | prod_U9SD6lFn3EcEYa | price_1TB9JCRrLM8xOFbklvsgEyiV |

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
