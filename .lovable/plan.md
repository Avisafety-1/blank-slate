

## Plan: Robust token-refresh uten full state-refresh

### Problemanalyse

Hver gang Supabase automatisk refresher JWT-tokenet (ca. hvert 55. minutt med 1-times levetid), kjører `onAuthStateChange` → `TOKEN_REFRESHED` → `refreshAuthState()`. Dette trigger:
1. Profil-query
2. Rolle-query  
3. `get_user_accessible_companies` RPC
4. `check-subscription` edge function
5. `getUser()` bakgrunnssjekk

Auth-loggene viser hyppige 500-feil og timeouts på `/user`-endepunktet (opptil 9 sekunder). Når disse feiler under token-refresh, mister brukeren tilgang til data midlertidig — selv om selve tokenet ble refreshet OK.

**Kjerneproblem:** Token-refresh trenger IKKE å re-hente profil, rolle og selskaper. Disse endres ekstremt sjelden (kun ved selskapsbytte eller admin-endringer). Å kjøre full refresh ved hvert token-refresh er overflødig og sårbart for database-timeouts.

### Løsning

#### `src/contexts/AuthContext.tsx` — Differensiert refresh-strategi

**1. Lett refresh ved TOKEN_REFRESHED:**
- Oppdater kun `session` og `user` objektene (allerede gjøres)
- IKKE kjør `refreshAuthState` — profil/rolle/selskaper endres ikke ved token-refresh
- Kjør kun `fireSubscriptionCheck` i bakgrunnen (for å holde betalingsstatus oppdatert)

**2. Full refresh kun ved reelle endringer:**
- `SIGNED_IN`: Full refresh (ny innlogging)
- `visibility` (tilbake fra bakgrunn >5s): Full refresh
- `online` (tilbake fra offline): Full refresh
- `switchCompany`: Full refresh
- `refetchUserInfo`: Full refresh

**3. Periodisk bakgrunnsoppfriskning:**
- Legg til en intervall (f.eks. hvert 15. minutt) som gjør en "soft refresh" av profil/rolle/selskaper — men kun hvis appen er synlig og online
- Dette fanger opp eventuelle rolle-endringer gjort av admin uten å belaste databasen ved hvert token-refresh

```text
BEFORE (ved TOKEN_REFRESHED):
  setSession → setUser → refreshAuthState()
  = 5+ database-kall som kan feile → bruker mister tilgang

AFTER (ved TOKEN_REFRESHED):
  setSession → setUser → fireSubscriptionCheck() (bakgrunn)
  = 0 blokkerende kall, abonnement oppdateres stille
```

**4. Fjern redundant `getUser()`-kall:**
- `backgroundUserCheck` kjører `supabase.auth.getUser()` som er et ekstra nettverkskall til `/user`
- Auth-loggene viser at dette endepunktet har hyppige timeouts
- Flytt denne sjekken til kun å kjøre ved `SIGNED_IN` og `visibility`-refresh, ikke ved token-refresh

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | TOKEN_REFRESHED → lett refresh, periodisk soft-refresh, fjern getUser ved token-refresh |

