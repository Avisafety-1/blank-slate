

## Problem Analysis

From the edge function logs I can see two issues:

1. **`create-checkout` works** — sessions are being created successfully, but `window.open(url, '_blank')` is likely being blocked by the browser's popup blocker (especially in the iframe/preview environment). The URL never opens.

2. **`customer-portal` has zero logs** — it may not have been deployed. But since you're not yet subscribed (check-subscription returns "No Stripe customer found" for hauggard@gmail.com), you only see the "Abonner nå" button anyway.

## Fix

**ProfileDialog.tsx** — Change both `window.open(data.url, '_blank')` calls to `window.location.href = data.url` so the redirect works without popup blockers.

**Deploy customer-portal** — Re-deploy the edge function to ensure it's available when you do have an active subscription.

These are the only two changes needed. The edge functions themselves are working correctly.

