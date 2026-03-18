

## Revidert plan: Kun strukturelle auth-endringer (ingen komponent-endringer)

Du har helt rett. Hvis vi fikser auth-laget riktig, trenger vi **ikke** endre individuelle komponenter som AddDroneDialog, Resources, osv. Den sentrale 401-retry i fetch-laget vil automatisk dekke alle RLS-spørringer i hele appen.

### Hva vi gjør (3 endringer, 2 filer)

#### 1. `src/integrations/supabase/client.ts` — Deduplisert refresh + 401 auto-retry

Legg til:
- `ensureFreshSession()` med delt promise (kun 1 refresh om gangen)
- `fetchWithRetry` wrapper som fanger 401, kaller `ensureFreshSession()`, og retrier **én gang**
- Supabase-klienten bruker denne via `global: { fetch: fetchWithRetry }`

Dette er sikkerhetsnettet som fikser **alle** komponenter uten å røre dem.

#### 2. `src/contexts/AuthContext.tsx` — Token-validering før `authInitialized`

Legg til `isTokenStale(session, 60)` helper. I `getSession()`-handleren (linje 683-700):
- Etter at session er hentet, sjekk om `expires_at` er innen 60 sekunder
- Hvis stale: kall `refreshSession()` **før** `authInitialized` settes til `true`
- Oppdater også `ensureValidToken()` (linje 822) til å bruke den delte `ensureFreshSession()` fra client.ts

Dette eliminerer vinduet der komponenter kjører queries med utløpt JWT ved sidelasting.

#### 3. Ingen komponent-endringer

401-retry i fetch-laget håndterer alle edge cases automatisk. Komponenter som AddDroneDialog, Resources, DocumentSection osv. trenger ikke endres.

### Filer som endres

| Fil | Endring |
|-----|--------|
| `src/integrations/supabase/client.ts` | `ensureFreshSession()` + `fetchWithRetry` wrapper |
| `src/contexts/AuthContext.tsx` | `isTokenStale()` sjekk før `authInitialized`, bruk delt refresh |

### Forventet resultat
- Ingen queries kjører med utløpt JWT ved sidelasting
- Midlertidige 401 under refresh håndteres automatisk med én sentral retry
- Ingen refresh-storm (deduplisert)
- Alle sider (droner, dokumenter, kart, admin) fikses uten individuelle endringer

