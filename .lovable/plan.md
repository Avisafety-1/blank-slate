

## Plan: Legg til/fjern tilleggsmoduler direkte fra profilen

### Problem
Det finnes ingen funksjonalitet for a legge til eller fjerne tilleggsmoduler pa et eksisterende abonnement. Profildialogen viser bare addons som read-only og sier "administrer via Stripe", men Stripe-portalen stotter ikke alltid a legge til nye subscription items.

### Losning

**1. Ny Edge Function: `manage-addon`**
- Aksepterer `{ addon_id: string, action: 'add' | 'remove' }`
- Verifiserer at brukeren er billing owner
- Henter eksisterende Stripe-subscription via `company_subscriptions`
- `add`: Legger til en ny subscription item med addon-prisen (`stripe.subscriptionItems.create`)
- `remove`: Finner og sletter subscription item med addon-prisen (`stripe.subscriptionItems.del`)
- Begge med `proration_behavior: 'create_prorations'`
- Oppdaterer `company_subscriptions.addons` i databasen
- Returnerer oppdatert addon-liste

**2. Oppdater ProfileDialog addon-seksjonen (linje 1906-1941)**
- Legg til en toggle-knapp (Switch eller Button) pa hver addon-rad for billing owner
- Klikk kaller `manage-addon` med riktig action
- Viser loading-state under operasjonen
- Etter suksess: kaller `check-subscription` pa nytt for a oppdatere global state
- Ikke-billing-owners ser fortsatt read-only visning

**3. Registrer edge function i `supabase/config.toml`**
- Legg til `[functions.manage-addon]` med `verify_jwt = false`

### Filer som endres/opprettes
- `supabase/functions/manage-addon/index.ts` (ny)
- `supabase/config.toml` (ny entry)
- `src/components/ProfileDialog.tsx` (addon-seksjonen)

