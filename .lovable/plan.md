

## Problem: Systemisk stale-token-feil på tvers av appen

### Analyse

Problemet er det **samme stale-token-problemet** vi fikset for SafeSky og OpenAIP-kartet, men det rammer **flere sider** i appen:

**Rotårsak**: `supabase.auth.getSession()` returnerer en utløpt JWT fra localStorage uten å refreshe den. Når sider deretter gjør RPC-kall (`has_role`) eller database-spørringer med denne utløpte tokenen, feiler kallene. Nettleseren har en gyldig refresh-token, men `autoRefreshToken` har ikke rukket å kjøre enda.

**Berørte steder** (der `supabase.rpc('has_role')` eller lignende kall gjøres uten forutgående token-validering):

| Sted | Symptom |
|------|---------|
| `Admin.tsx` linje 133-155 | "Feil ved sjekking av tilgang" → redirect til `/` |
| `useAdminCheck.ts` | `isAdmin` settes til `false` feilaktig |
| `CalendarWidget.tsx` linje 107-120 | Admin-knapper vises ikke |
| `DocumentDetailDialog.tsx` linje 54-65 | Admin-status sjekkes feil |
| `IncidentDetailDialog.tsx` linje 73-85 | Admin-status sjekkes feil |
| `Kalender.tsx` linje 131-145 | Admin-knapper mangler |

**Alle disse stedene** bruker enten `supabase.auth.getUser()` individuelt (som trigger et nytt `/user`-kall hver gang) eller ingen token-validering i det hele tatt.

### Auth-loggene bekrefter problemet

Loggene viser **massive mengder `/user`-kall** — noen med latens på 400ms–1000ms. Mange av disse er parallelle kall fra ulike komponenter som alle prøver å validere tokenen uavhengig. Dette er ineffektivt og kan forklare treg lasting.

### Løsning: Sentralisert token-refresh i AuthContext

I stedet for å fikse hvert enkelt sted individuelt, bør vi legge til en **sentralisert, cached `ensureValidToken()`-funksjon** i AuthContext som alle sider kan bruke. AuthContext har allerede en `getUserCacheRef` med 10s TTL — vi eksponerer denne logikken som en gjenbrukbar funksjon.

### Endringer

**1. `src/contexts/AuthContext.tsx`** — Eksponere `ensureValidToken()` i context

- Lag en ny funksjon `ensureValidToken()` som bruker den eksisterende `getUserCacheRef` (10s TTL cache) til å kalle `getUser()` kun hvis cachen er utløpt
- Legg den til i `AuthContextType` interface og Provider value
- Dette forhindrer at 10+ komponenter alle gjør separate `/user`-kall

**2. `src/pages/Admin.tsx`** — Bruk `ensureValidToken()` før `has_role` RPC

- I `checkAdminStatus()`: kall `await ensureValidToken()` før `supabase.rpc('has_role', ...)`
- Fjern den direkte `user?.id`-bruken som kan ha stale data; bruk `user` fra auth context

**3. `src/hooks/useAdminCheck.ts`** — Samme fix

- Kall `ensureValidToken()` før `supabase.rpc('has_role', ...)`

**4. `src/components/dashboard/CalendarWidget.tsx`** — Erstatt individuelt `getUser()`-kall med `ensureValidToken()`

**5. `src/components/dashboard/DocumentDetailDialog.tsx`** — Samme

**6. `src/components/dashboard/IncidentDetailDialog.tsx`** — Samme

**7. `src/pages/Kalender.tsx`** — Samme

### Teknisk detalj

```typescript
// I AuthContext — ny funksjon
const ensureValidToken = async (): Promise<void> => {
  if (!navigator.onLine) return;
  const now = Date.now();
  const cached = getUserCacheRef.current;
  if (cached && now - cached.timestamp < 10_000) return; // Still fresh
  const result = await supabase.auth.getUser();
  getUserCacheRef.current = { data: result, timestamp: now };
  if (result.error && isMissingAuthUserError(result.error)) {
    await clearLocalAuthData(user?.id);
  }
};
```

Alle komponenter kaller `await ensureValidToken()` i stedet for individuelle `supabase.auth.getUser()` for admin-sjekker. Dette sikrer:
- Maks 1 `/user`-kall per 10 sekunder på tvers av hele appen
- Alle RPC/DB-kall bruker en gyldig, refreshet JWT
- Dramatisk reduksjon i `/user`-kall (fra 50+ til 1-2 per sidebytting)

