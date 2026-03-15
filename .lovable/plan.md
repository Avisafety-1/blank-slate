

## Plan: Bekreftelsesdialog for seat-kostnad ved godkjenning av bruker

Når admin klikker «Godkjenn» på en ventende bruker, vises en AlertDialog som informerer om kostnaden for den ekstra brukeren før godkjenningen utføres.

### Endringer i `src/pages/Admin.tsx`

1. **Ny state** for å holde bruker-ID som venter på bekreftelse (`pendingApproveUserId`).

2. **Godkjenn-knappen** endres fra å kalle `approveUser(id)` direkte til å sette `pendingApproveUserId`, som åpner dialogen.

3. **Ny AlertDialog** som viser:
   - Brukerens navn/e-post
   - Gjeldende plan og pris per bruker (fra `subscriptionPlan` i AuthContext + `PLANS`-config)
   - Antall brukere etter godkjenning (nåværende seatCount + 1)
   - Ny månedskostnad: `planPris × (seatCount + 1)` + eventuelle addons
   - Merknad om at Stripe proraterer automatisk (du betaler kun for gjenstående dager denne måneden)
   - «Godkjenn og betal» og «Avbryt»-knapper

4. Ved bekreftelse kalles eksisterende `approveUser()` med den lagrede bruker-IDen.

### Ingen backend-endringer
Alt beregnes fra eksisterende frontend-data (`subscriptionPlan`, `seatCount`, `PLANS`-config). Selve betalingen håndteres av Stripe proration som allerede er implementert.

