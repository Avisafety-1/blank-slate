

## Plan: Legg til arv-mekanisme for SafeSky callsign

SafeSky callsign-blokken har allerede en «Gjelder for alle underavdelinger»-toggle og `safesky_callsign_propagate`-kolonnen i databasen, men mangler låsemekanismen for avdelinger (child departments). Ingen DB-migrasjon nødvendig.

### Endringer i `ChildCompaniesSection.tsx`

**1. Utvid parent-fetch med callsign-data:**
- Legg til `safesky_callsign_prefix`, `safesky_callsign_variable`, `safesky_callsign_propagate` i parent-select (linje 348).
- Legg til disse tre feltene i `inherited`-state-objektet (linje 386-409).

**2. Lås UI for child departments:**
- Beregn `callsignLocked = isChildDept && !!inherited?.safesky_callsign_propagate`.
- Når låst: vis Lock-badge + «Arvet fra {parentNavn}» banner øverst i SafeSky-blokken.
- Overstyr visningsverdiene med parent-verdiene (`inherited.safesky_callsign_prefix`, `inherited.safesky_callsign_variable`).
- Deaktiver Input, RadioGroup og Switch, skjul «Lagre»-knappen.
- Skjul «Gjelder for alle underavdelinger»-toggle for child departments.

**3. Oppdater `handleSaveCallsign`:**
- Legg til `propagate_sora_buffer_mode`-lignende flagg-persistens: når `callsignPropagate` settes på, pusher prefix og variable til alle barn (allerede implementert), men nå setter vi også `safesky_callsign_propagate = true` eksplisitt som propageringsflagg slik at barnas UI låses.

### Filer som endres
- `src/components/admin/ChildCompaniesSection.tsx` (utvid inherited-state, lås SafeSky-blokken for barn).

### UI-detaljer (konsistent med resten)
- Badge: `secondary` med `Lock`-ikon.
- Banner: `border-primary/40 bg-primary/5` med Lock-ikon + «Styres av morselskapet ({parentNavn})».
- Deaktiverte felter får `disabled`-attributt.

