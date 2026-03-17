

## Problem

Admin-siden gjør en **egen, redundant RPC-sjekk** (`has_role`) for å verifisere admin-tilgang, selv om `AuthContext` allerede har `isAdmin` tilgjengelig fra profilinnlastingen. Når nettverket er tregt eller `ensureValidToken()` feiler (f.eks. i Lovable preview-iframe), kaster dette en feil som trigger `navigate("/")` og toast "Feil ved sjekking av tilgang".

Kjerneproblemet: Admin.tsx har sin **egen lokale** `isAdmin` state (linje 99) og kaller `checkAdminStatus()` via RPC — men AuthContext har allerede `isAdmin` fra rolle-sjekken under profilinnlasting.

## Løsning

Bruk `isAdmin` direkte fra `useAuth()` i stedet for å gjøre en separat RPC-sjekk. Dette eliminerer det ekstra nettverkskallet og gjør siden robust mot midlertidige nettverksfeil.

### Endringer i `src/pages/Admin.tsx`

1. **Fjern lokal `isAdmin` state** (linje 99) og `checkAdminStatus`-funksjonen (linje 133-156)
2. **Hent `isAdmin` fra `useAuth()`** — legg til i destructuring på linje 90
3. **Erstatt useEffect som kaller `checkAdminStatus`** (linje 120-124) med en enkel sjekk: hvis `!loading && user && !isAdmin`, vis toast og redirect
4. **Oppdater fetchData-triggeren** (linje 127-131) til å bruke `isAdmin` fra context i stedet for lokal state

Denne endringen fjerner 1 unødvendig RPC-kall per admin-sidebesøk og forhindrer at nettverksfeil blokkerer tilgang for verifiserte administratorer.

