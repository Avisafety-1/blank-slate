

## Stripe-fritak for eksisterende selskaper

### Problem
Selskaper som allerede er godkjent og faktureres på annen måte (direkte faktura etc.) skal ikke møte Stripe-betaling. Brukere som registrerer seg med selskapskode til et slikt selskap skal slippe SubscriptionGate helt.

### Løsning

#### 1. Database: Ny kolonne `stripe_exempt` på `companies`
- `ALTER TABLE companies ADD COLUMN stripe_exempt BOOLEAN NOT NULL DEFAULT false;`
- Eksisterende selskaper som faktureres separat settes til `true` manuelt eller via admin-panel

#### 2. AuthContext: Hent og eksponer `stripe_exempt`
- Utvid `fetchUserInfo` sin company-query til å inkludere `stripe_exempt`
- Legg til `stripeExempt` i context state og cache
- Når `stripeExempt` er `true`, sett `subscribed = true` automatisk (eller legg til egen flag)

#### 3. SubscriptionGate: Respekter fritak
- Legg til `stripeExempt` i gate-logikken:
  ```typescript
  if (subscriptionLoading || !user || !isApproved || isSuperAdmin || subscribed || stripeExempt) {
    return <>{children}</>;
  }
  ```

#### 4. ProfileDialog: Skjul Stripe-elementer
- Når `stripeExempt`: skjul abonnement-fanen eller vis «Faktureres separat» i stedet for Stripe-knapper

#### 5. Admin-panel: Toggle for selskaper
- Legg til en Switch i CompanyManagementDialog for å sette `stripe_exempt` per selskap

### Filer som endres
- **DB-migrasjon**: Ny kolonne `stripe_exempt` på `companies`
- `src/contexts/AuthContext.tsx`: Hent og eksponer `stripeExempt`
- `src/components/SubscriptionGate.tsx`: Sjekk `stripeExempt`
- `src/components/ProfileDialog.tsx`: Tilpass visning
- `src/components/admin/CompanyManagementDialog.tsx` eller `CompanyManagementSection.tsx`: Admin-toggle

