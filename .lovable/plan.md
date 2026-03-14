

## Stripe Subscription Integration for AviSafe

### Existing Stripe Setup
- **Product**: "AviSafe platform" (`prod_U9B1AxOIjwOEVM`)
- **Price**: 599 NOK/month (`price_1TAsfcRwSSSiRYeAbi7Uhpnz`)

### What will be built

**3 Edge Functions:**

1. **`check-subscription`** — Checks if the authenticated user's email has an active Stripe subscription. Returns `{ subscribed, product_id, subscription_end }`. Called on login, page load, and periodically.

2. **`create-checkout`** — Creates a Stripe Checkout session for the AviSafe subscription (599 NOK/mo). Redirects user to Stripe's hosted checkout page. Reuses existing Stripe customer if found.

3. **`customer-portal`** — Creates a Stripe Customer Portal session so users can manage billing, cancel, or update payment methods.

**Frontend changes:**

4. **AuthContext** — Add `subscribed`, `subscriptionEnd`, and `subscriptionLoading` state. Auto-check subscription on login and periodically (every 60s).

5. **Pricing page** (`/priser`) — New public-ish route showing the AviSafe plan (599 NOK/mo) with a "Subscribe" button that triggers checkout. Accessible from auth page and for logged-in users.

6. **ProfileDialog** — Add a "Subscription" tab showing current plan status, end date, and a "Manage Subscription" button linking to Stripe Customer Portal.

7. **Config** — `supabase/config.toml` entries for the 3 new edge functions.

### Technical details

- Edge functions use `verify_jwt = false` with manual JWT validation via `getUser(token)`
- Stripe API version: `2025-08-27.basil`
- `STRIPE_SECRET_KEY` is already configured as a secret
- No webhooks needed — subscription status is checked live via Stripe API
- Price ID `price_1TAsfcRwSSSiRYeAbi7Uhpnz` hardcoded in checkout function
- Success URL redirects back to app with a toast confirmation
- Customer Portal requires activation in Stripe Dashboard: https://dashboard.stripe.com/test/settings/billing/portal

