

## Analyse og plan

### Problem 1: Kan ikke endre plan i kundeportalen

Stripe Customer Portal bruker en spesifikk konfigurasjon (`bpc_1TAwCORrLM8xOFbkaDYKNI3A`). Denne konfigurasjonen må oppdateres direkte i Stripe Dashboard for å tillate planbytte (subscription switching). Dette er en innstilling i Stripe, ikke i koden.

**Hva som må gjøres:**
- Gå til [Stripe Customer Portal Settings](https://dashboard.stripe.com/settings/billing/portal) og aktiver "Allow customers to switch plans" (subscription updates). Legg til alle tre planene (Starter, Grower, Professional) som valgbare.
- Alternativt kan vi bygge en egen planbytte-funksjon i appen som kaller Stripe API direkte (`stripe.subscriptions.update`) — dette gir bedre kontroll over UX.

**Anbefaling:** Begge deler — aktiver planbytte i portalen OG bygg en in-app planvelger i ProfileDialog slik at brukere kan oppgradere/nedgradere uten å forlate appen.

### Problem 2: Automatisk seat-synk for nye brukere

`update-seats` Edge Function finnes men kalles aldri. Når en ny bruker godkjennes i et selskap, oppdateres ikke Stripe-abonnementet med riktig antall seter.

**Hva som må gjøres:**
- Kalle `update-seats` automatisk når en bruker godkjennes (approved = true) eller fjernes fra selskapet
- To tilnærminger:
  1. **Database-trigger** (foretrukket): Lag en Postgres-trigger på `profiles`-tabellen som kaller Edge Function via `pg_net` når `approved` endres
  2. **Frontend-kall**: Kalle `update-seats` fra admin-UI etter bruker-godkjenning

### Implementeringsplan

**1. In-app planbytte-funksjon (ny Edge Function `change-plan`)**
- Tar imot `new_plan` parameter
- Verifiserer at brukeren er billing owner
- Finner eksisterende subscription og oppdaterer plan-item med ny price ID
- Returnerer oppdatert plan-info

**2. Oppdater ProfileDialog med planbytte-UI**
- I abonnement-tabben: vis de tre planene med mulighet for å bytte
- Markér nåværende plan, la billing owner klikke for å bytte
- Kall `change-plan` Edge Function

**3. Automatisk seat-synk**
- Legg til `supabase.functions.invoke('update-seats', { body: { company_id } })` i admin-godkjenningslogikken (der brukere godkjennes/avvises)
- Søk opp alle steder der `approved` oppdateres og legg til kallet der

**4. Oppdater Stripe Portal-konfigurasjon**
- Du må manuelt aktivere "Subscription updates" i Stripe Dashboard under Portal Settings, og legge til de tre planene som byttbare produkter

### Tekniske detaljer

**Ny Edge Function: `change-plan/index.ts`**
- Autentiser bruker → sjekk billing owner → hent subscription → finn plan-item → `stripe.subscriptionItems.update(itemId, { price: newPriceId })` → synk `company_subscriptions`

**Seat-synk trigger-punkter** (i frontend):
- Admin godkjenner bruker
- Admin fjerner bruker
- Bruker sletter egen konto

