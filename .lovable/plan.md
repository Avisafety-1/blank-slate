

## Fix: Profildialogen blinker etter kansellert Stripe-abonnement

### Problemet
Når et abonnement kanselleres i Stripe, oppdaterer webhooken `company_subscriptions.status` til `canceled`. Deretter:

1. `SubscriptionGate` sjekker: `subscriptionLoading || authRefreshing` → sant → viser barna (appen)
2. Refresh fullføres → `authRefreshing = false`, `subscribed = false` → viser betalingsmuren
3. En ny refresh trigges (TOKEN_REFRESHED, visibility change, periodisk) → `authRefreshing = true` → viser barna igjen
4. Repeat → **blinkende loop**

Problemet er at `authRefreshing` i SubscriptionGate-betingelsen lar appen "skinne gjennom" under hver refresh-syklus, selv når abonnementet allerede er bekreftet kansellert.

### Løsning
Endre `SubscriptionGate` slik at `authRefreshing` **ikke** brukes som bypass-betingelse etter at subscription-status allerede er kjent. Appen skal kun vise barn under `subscriptionLoading` (initial lastestadium), ikke under påfølgende refreshes.

### Endring i `src/components/SubscriptionGate.tsx`

Erstatt den eksisterende bypass-betingelsen:
```typescript
// FØR:
if (subscriptionLoading || !user || !profileLoaded || !isApproved || isSuperAdmin || subscribed || stripeExempt || authRefreshing) {
  return <>{children}</>;
}

// ETTER:
if (!user || !profileLoaded || subscriptionLoading || !isApproved || isSuperAdmin || subscribed || stripeExempt) {
  return <>{children}</>;
}
```

Fjern `authRefreshing` fra betingelsen. `subscriptionLoading` dekker allerede den initiale lastingen. Når subscription-status er satt (loading = false), skal resultatet stå fast selv under bakgrunns-refreshes.

### Fil som endres
- `src/components/SubscriptionGate.tsx` — fjern `authRefreshing` fra bypass-betingelsen (én linje)

