## Multi-Company Access – IMPLEMENTERT

### Database
- `companies.parent_company_id` – valgfri FK til morselskap
- `user_companies` – junction-tabell (user_id, company_id, role) med RLS
- Indexes: `idx_user_companies_user`, `idx_user_companies_company`
- `get_user_accessible_companies(_user_id)` – returnerer tilgjengelige selskaper
- `can_user_access_company(_user_id, _company_id)` – validerer tilgang
- Eksisterende profiler seedet inn i user_companies

### Frontend
- `AuthContext`: `accessibleCompanies`, `switchCompany()` 
- `Header`: Selskapsbytter vises for alle brukere med tilgang til >1 selskap
- `CompanyManagementDialog`: Morselskap-velger (superadmin)

### Arkitektur
- `profiles.company_id` = aktivt selskap (uendret)
- Selskapsbytte = oppdaterer profiles.company_id → refetch → RLS filtrerer automatisk

### Konsolidert visning (moderselskap ser underselskap) – IMPLEMENTERT
- `get_user_visible_company_ids(_user_id)` – returnerer brukerens company + alle child companies (kun for admin-roller)
- Alle SELECT RLS-policyer oppdatert: `company_id = ANY(get_user_visible_company_ids(auth.uid()))`
- 40+ tabeller dekket inkl. join-tabeller (mission_drones, drone_equipment, flight_log_personnel osv.)
- INSERT/UPDATE/DELETE-policyer uendret – skriving skjer alltid til aktivt selskap
- Vanlige brukere (rolle=bruker) påvirkes ikke – ser kun eget selskap

---

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
- `supabase/functions/update-seats/index.ts` – Automatisk seat-synk (kalles ved godkjenning/sletting)
- `supabase/functions/change-plan/index.ts` – In-app planbytte
- `src/contexts/AuthContext.tsx` – Nye felter: subscriptionPlan, subscriptionAddons, isBillingOwner, seatCount
- `src/components/SubscriptionGate.tsx` – Planvelger-UI
- `src/pages/Priser.tsx` – Tre planer + tilleggsmoduler
- `src/components/ProfileDialog.tsx` – Planbytte-UI + abonnement-tab
- DB-migrasjon: `company_subscriptions`-tabell, `billing_user_id` på companies

### Seat-synk
- `update-seats` kalles automatisk fra `Admin.tsx` ved:
  - Godkjenning av bruker (`approveUser`)
  - Sletting av bruker (`deleteUser`)

### Planbytte
- Billing owner kan bytte plan direkte i ProfileDialog uten å forlate appen
- `change-plan` Edge Function oppdaterer Stripe subscription item + company_subscriptions

### Gjenstår (oppfølging)
- Feature-gating basert på addons (SORA/DJI/ECCAIRS)
- Admin-panel: vise selskapsplan i oversikten
- Stripe Portal: Aktiver "Subscription updates" i Dashboard for planbytte via portal
