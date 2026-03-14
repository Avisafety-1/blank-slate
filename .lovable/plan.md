

## Trial-basert registreringsflyt med Stripe

### Oversikt
Nye brukere kan registrere seg enten med selskapskode (eksisterende selskap) eller ved å opprette et nytt selskap. Alle nye brukere sendes gjennom Stripe Checkout med 5 dagers gratis prøveperiode. Etter utløp uten betaling blokkeres tilgang til appen med en betalingsside.

### Flyt

```text
Registrering
├── Nytt selskap (navn + org.nr)
│   → Selskap opprettes i DB
│   → Profil: approved = true (auto)
│   → Rolle: administrator
│   → Redirect til Stripe Checkout (5d trial)
│   → Tilgang umiddelbart
│
└── Selskapskode (eksisterende)
    → Profil: approved = false
    → Admin godkjenner
    → Abonnement sjekkes via selskapets eier
    → Tilgang etter godkjenning
```

### Endringer

#### 1. Stripe Checkout — legg til trial
**`supabase/functions/create-checkout/index.ts`**
- Legg til `subscription_data: { trial_period_days: 5 }` i `stripe.checkout.sessions.create()`

#### 2. check-subscription — inkluder trialing-status
**`supabase/functions/check-subscription/index.ts`**
- Utvid `subscriptions.list` til å inkludere `status: "trialing"` i tillegg til `"active"`
- Legg til `trial_end`-felt i responsen
- Returner `is_trial: true/false`

#### 3. Auth-side — nytt selskap-alternativ
**`src/pages/Auth.tsx`**
- Legg til en toggle/tabs: «Bruk selskapskode» / «Opprett nytt selskap»
- Nytt selskap-modus: felt for selskapsnavn og valgfritt org.nr
- Ved registrering med nytt selskap:
  1. `supabase.auth.signUp()` med user_metadata
  2. Opprett selskap i `companies`-tabellen (med generert registration_code)
  3. Opprett profil med `approved: true` og `company_id`
  4. Tildel rolle `administrator`
  5. Kall `create-checkout` og redirect til Stripe (trial)

#### 4. Database-migrasjon
- Tillat insert til `companies` for authenticated brukere (ny RLS policy)
- Funksjon for å generere unik `registration_code` automatisk

#### 5. AuthContext — trial-state
**`src/contexts/AuthContext.tsx`**
- Legg til `isTrial` og `trialEnd` state fra `check-subscription`

#### 6. Subscription gate — blokker utløpte brukere
**`src/App.tsx` / `src/pages/Index.tsx`**
- Ny komponent `SubscriptionGate`:
  - Hvis bruker er innlogget + godkjent, men `!subscribed` og ingen aktiv trial → vis betalingsside
  - Betalingssiden viser: «Prøveperioden er utløpt. Abonner for å fortsette.» med checkout-knapp
  - Bruker kan fortsatt åpne profil/abonnement-fanen

#### 7. ProfileDialog — vis trial-info
**`src/components/ProfileDialog.tsx`**
- Vis «Prøveperiode» badge med utløpsdato når `isTrial`
- Vis «X dager igjen» nedtelling

### Tekniske detaljer

**Stripe trial config:**
```typescript
subscription_data: {
  trial_period_days: 5,
  trial_settings: {
    end_behavior: { missing_payment_method: 'cancel' }
  }
}
```
Merk: Stripe kan kreve betalingsmetode ved checkout selv med trial. Med `missing_payment_method: 'cancel'` avsluttes abonnementet automatisk etter trial uten kort.

**check-subscription utvidelse:**
```typescript
// Hent både active og trialing
const subscriptions = await stripe.subscriptions.list({
  customer: customerId,
  limit: 1,
});
// Filtrer for active eller trialing
const sub = subscriptions.data.find(s => 
  s.status === 'active' || s.status === 'trialing'
);
```

**Gate-logikk i frontend:**
```typescript
// I AuthenticatedLayout eller Index
if (user && isApproved && !subscriptionLoading && !subscribed) {
  return <SubscriptionExpiredPage />;
}
```

