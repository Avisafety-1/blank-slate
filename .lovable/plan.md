

## Ny prismodell med tre planer, tilleggsmoduler og per-seat billing

### Oversikt

Erstatte nåværende enkeltplan (599 NOK/mnd) med:
- **Starter** (99 kr/bruker/mnd), **Grower** (199 kr/bruker/mnd), **Professional** (299 kr/bruker/mnd)
- **Tilleggsmoduler**: SORA Admin, DJI-integrasjon, ECCAIRS-integrasjon — 99 kr/stk/mnd (valgfrie)
- Én betalingsansvarlig per selskap. Andre brukere ser kun hvilken plan selskapet har.

---

### 1. Stripe-produkter og priser

Opprette 6 nye produkter med priser i Stripe:

| Produkt | Pris | Intervall |
|---------|------|-----------|
| AviSafe Starter | 9900 øre (99 NOK) | monthly, per seat |
| AviSafe Grower | 19900 øre (199 NOK) | monthly, per seat |
| AviSafe Professional | 29900 øre (299 NOK) | monthly, per seat |
| Tillegg: SORA Admin | 9900 øre (99 NOK) | monthly |
| Tillegg: DJI-integrasjon | 9900 øre (99 NOK) | monthly |
| Tillegg: ECCAIRS-integrasjon | 9900 øre (99 NOK) | monthly |

Tilleggsmodulene er flat-pris (ikke per-seat) — de aktiveres for hele selskapet.

### 2. Databaseendringer

**Ny tabell: `company_subscriptions`**
```
company_id (FK companies, unique)
stripe_customer_id text
billing_user_id (FK auth.users)
plan text ('starter' | 'grower' | 'professional')
stripe_subscription_id text
status text ('active' | 'trialing' | 'canceled' | 'past_due')
seat_count integer
current_period_end timestamptz
cancel_at_period_end boolean
is_trial boolean
trial_end timestamptz
addons text[] (f.eks. ['sora_admin', 'dji', 'eccairs'])
updated_at timestamptz
```

**companies-tabell**: Legg til `billing_user_id uuid` — hvem som er betalingsansvarlig.

RLS: Alle autentiserte brukere i selskapet kan lese. Kun billing_user kan oppdatere.

### 3. Edge Functions

**`create-checkout`** — Omskrives:
- Mottar `{ plan: 'starter'|'grower'|'professional', addons?: string[] }` i body
- Teller antall godkjente brukere i selskapet (`profiles` med `company_id` og `approved = true`)
- Oppretter Stripe checkout med:
  - Hovedplan-pris × antall brukere (quantity)
  - Valgte tilleggspriser (quantity = 1 hver)
- Setter `billing_user_id` på selskapet etter suksess (via webhook)
- Trial-logikk beholdes (5 dager for nye kunder)

**`check-subscription`** — Omskrives:
- Sjekker selskapets Stripe-abonnement (via `company_subscriptions.stripe_customer_id`), ikke individuell e-post
- Returnerer: `{ subscribed, plan, seat_count, addons, is_trial, trial_end, subscription_end, cancel_at_period_end, had_previous_subscription }`

**`stripe-webhook`** — Utvides:
- Ved subscription created/updated: oppdater `company_subscriptions` med plan, status, seat_count, addons, period_end
- Ved checkout.session.completed: sett `billing_user_id` på selskapet

**`customer-portal`** — Oppdateres:
- Kun tillatt for billing_user (sjekk mot `companies.billing_user_id`)

**Ny: `update-seats`** — Automatisk seat-synk:
- Trigges når brukere legges til/fjernes fra selskap
- Oppdaterer Stripe subscription quantity

### 4. AuthContext

Utvide context med:
- `subscriptionPlan: 'starter' | 'grower' | 'professional' | null`
- `subscriptionAddons: string[]`
- `isBillingOwner: boolean`
- Fjerne/erstatte enkel `subscribed` boolean — beholde for bakoverkompatibilitet

`check-subscription` kalles som før, men nå basert på selskap.

### 5. Frontend-endringer

**`Priser.tsx`** — Omskrives helt:
- Tre kolonner: Starter / Grower / Professional med per-bruker-pris
- Tilleggsmodul-seksjon under med avkryssingsbokser
- "Velg plan"-knapp sender `{ plan, addons }` til `create-checkout`
- Ikke-innloggede sendes til `/auth`

**`SubscriptionGate.tsx`** — Oppdateres:
- Bruk nye felter (`subscriptionPlan`, selskapsbasert)
- Vise planvelger for nye brukere og "forny"-variant for returnerende
- Vise alle tre planer med priser

**`ProfileDialog.tsx` (Abonnement-tab)**:
- Vise nåværende plan og aktive tillegg
- Betalingsansvarlig (billing owner) ser: Administrer-knapp, endre plan, endre tillegg
- Andre brukere ser kun lesbar info: "Ditt selskap har plan X med tillegg Y"

**Admin-panel**:
- Vise selskapets plan og tillegg i selskapsoversikten
- Superadmin kan se/overstyre

### 6. Feature-gating (tillegg)

Tilleggsmodulene bør gate funksjonalitet:
- **SORA Admin**: `eccairs_enabled`-lignende sjekk mot `addons`-array
- **DJI**: Erstatte/supplere `dji_flightlog_enabled` med addon-sjekk
- **ECCAIRS**: Erstatte/supplere `eccairs_enabled` med addon-sjekk

Dette kan gjøres i en oppfølgende fase for å holde denne leveransen fokusert.

### Filer som endres/opprettes

| Fil | Handling |
|-----|---------|
| Stripe (6 produkter) | Opprettes via tool |
| DB-migrasjon | `company_subscriptions`-tabell, `billing_user_id` på companies |
| `supabase/functions/create-checkout/index.ts` | Omskrives |
| `supabase/functions/check-subscription/index.ts` | Omskrives (selskapsbasert) |
| `supabase/functions/stripe-webhook/index.ts` | Utvides |
| `supabase/functions/customer-portal/index.ts` | Legg til billing_user-sjekk |
| `supabase/functions/update-seats/index.ts` | Ny |
| `src/contexts/AuthContext.tsx` | Nye felter |
| `src/components/SubscriptionGate.tsx` | Ny planvelger-UI |
| `src/pages/Priser.tsx` | Omskrives (tre planer + tillegg) |
| `src/components/ProfileDialog.tsx` | Oppdater abonnement-tab |
| `src/config/subscriptionPlans.ts` | Ny konfig-fil med plan/pris-mapping |
| `supabase/config.toml` | Registrer nye funksjoner |

### Rekkefølge

1. Opprette Stripe-produkter og -priser
2. DB-migrasjon
3. Konfig-fil med plan-mapping
4. Backend (edge functions)
5. AuthContext
6. Frontend (SubscriptionGate, Priser, ProfileDialog)

