

## Problem

Når en ny bruker ser `SubscriptionGate` for første gang (aldri hatt abonnement), viser den "599 NOK/mnd" og "Abonner nå". Men Stripe checkout gir faktisk 5 dagers gratis trial — så UI-en bør gjenspeile dette. Samtidig skal brukere med utløpt abonnement se en "Forny"-variant uten trial-tilbud.

## Plan

### 1. `create-checkout/index.ts` — Hindre trial-misbruk
- Hvis `customerId` finnes, sjekk `stripe.subscriptions.list({ customer: customerId })` 
- Hvis kunden har hatt et tidligere abonnement: **dropp** `trial_period_days` og `trial_settings`
- Nye kunder får trial som før

### 2. `SubscriptionGate.tsx` — To ulike visninger
Bruk `check-subscription`-responsens data (via AuthContext) for å avgjøre om bruker er ny vs. har hatt abonnement.

**Ny bruker (aldri hatt abonnement):**
- Ikon: Grønt/blått trial-ikon
- Tittel: "Prøv AviSafe gratis i 5 dager"
- Tekst: "Start din gratis prøveperiode — ingen betaling før etter 5 dager."
- Pris: "Deretter 599 NOK/mnd" (nedtonet)
- Knapp: "Start gratis prøveperiode"

**Utløpt abonnement:**
- Beholde dagens visning med "Pr