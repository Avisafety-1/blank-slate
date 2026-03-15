

## Plan: Drone-grense per bruker (seat)

Starter-planen har `maxDrones: 1`, men dette skal være **per bruker/seat**. Altså: 1 drone × antall brukere i selskapet.

### Endringer

**1. `src/hooks/usePlanGating.ts`**
- Hent `seatCount` fra `useAuth()`
- Endre `maxDrones` fra `plan.maxDrones` til `plan.maxDrones * seatCount`

**2. `src/components/resources/AddDroneDialog.tsx`**
- Oppdater feilmeldingen til å vise at grensen er per bruker, f.eks. "Du har nådd maks antall droner (X) for din plan (Y droner per bruker × Z brukere)."

**3. `src/config/subscriptionPlans.ts`**
- Oppdater feature-teksten for Starter fra "Maks 1 drone" til "1 drone per bruker"
- Tilsvarende for Grower ("Opptil 5 droner per bruker") og Professional ("Opptil 15 droner per bruker")

