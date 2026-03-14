

## Problem

When clicking "Abonner nå" or "Administrer abonnement" in the profile dialog, `window.location.href` redirects the Lovable preview iframe to Stripe's checkout/portal page. Stripe blocks rendering inside iframes (via `X-Frame-Options`), resulting in a white loading screen.

The network logs confirm the Edge Function succeeds and returns a valid Stripe URL — the issue is purely the redirect method.

## Solution

Change both the checkout and customer-portal redirects in `ProfileDialog.tsx` (and `Priser.tsx`) to use `window.open(url, '_blank')` which opens Stripe in a new tab. This works reliably in both the Lovable preview iframe and the published app.

### Changes

**`src/components/ProfileDialog.tsx`** (lines 1705 and 1722):
- Replace `window.location.href = data.url` with `window.open(data.url, '_blank')` in both the "Administrer abonnement" and "Abonner nå" button handlers.

**`src/pages/Priser.tsx`**:
- Same change for the checkout redirect there.

This is a 3-line change across 2 files.

