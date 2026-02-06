

# Fiks offline-modus: Autentisering, data-caching og misjonsliste

## Problemanalyse

Jeg har funnet tre konkrete arsaker til at offline-modus ikke fungerer som forventet:

### Problem 1: Autentisering feiler offline
Nar appen starter, kaller `AuthContext` databasen for a hente brukerinformasjon (selskap, rolle, godkjent-status). Offline feiler dette kallet, og `isApproved` forblir `false`. Deretter blokkerer `AuthenticatedLayout` all rendering fordi den sjekker `if (!user || !isApproved)` -- sa brukeren ser en blank side.

### Problem 2: Sidene bruker ikke TanStack Query
Sidene Ressurser, Oppdrag, Hendelser, Status og Kalender henter data direkte med `supabase.from().select()` i `useEffect`-hooks. Kun Dokumenter-siden bruker TanStack Query. Derfor hjelper ikke `PersistQueryClientProvider`-cachen for de fleste sidene -- dataen forsvinner nar Supabase-kallene feiler offline.

### Problem 3: StartFlightDialog henter misjoner direkte
Dialogen for a starte flytur henter misjoner fra databasen i en `useEffect`. Nar man er offline, returnerer dette tomt resultat, og man kan ikke velge misjon.

---

## Losningsstrategi

Istedenfor a migrere alle sider til TanStack Query (som ville vaert en enorm refaktor), implementerer vi:

1. **Offline-sikker autentisering** -- Cache brukerdata i localStorage
2. **Generisk offline-cache-hjelper** -- En `useOfflineCache`-funksjon som alle fetch-funksjoner kan bruke
3. **Offline-sikker StartFlightDialog** -- Bruk cachet misjonsliste
4. **DomainGuard offline-bypass** -- Ikke omdiriger nar man er offline

---

## Detaljert implementering

### Steg 1: Offline-sikker AuthContext

**Fil: `src/contexts/AuthContext.tsx`**

Endringer:
- Etter vellykket `fetchUserInfo`, lagre resultatet i `localStorage` under nokkel `avisafe_user_profile_{userId}`
- Ved oppstart: Hvis `getSession()` returnerer en gyldig sesjon men `fetchUserInfo()` feiler (offline), les cachet profil fra localStorage
- Sett `isApproved`, `companyId`, `companyName`, `companyType`, `userRole`, `isAdmin`, `isSuperAdmin` fra cachet data
- Legg til en `isOfflineMode`-flagg i konteksten sa andre komponenter kan vite at data er cachet

```text
// Ny hjelpefunksjon
const PROFILE_CACHE_KEY = (userId: string) => `avisafe_user_profile_${userId}`;

// I fetchUserInfo - etter vellykket henting:
localStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify({
  companyId, companyName, companyType, isApproved, userRole, isAdmin, isSuperAdmin
}));

// I getSession - hvis fetchUserInfo feiler:
const cached = localStorage.getItem(PROFILE_CACHE_KEY(userId));
if (cached) {
  // Bruk cachet data
}
```

### Steg 2: Generisk offline-cache-hjelper

**Ny fil: `src/lib/offlineCache.ts`**

En enkel hjelper som wrapper enhver fetch-funksjon:
- Ved vellykket nettverkshenting: Lagre resultatet i localStorage med en nokkel
- Ved feilet henting (offline): Returner sist lagrede resultat fra localStorage
- Inkluderer TTL (time-to-live) for a unnga uendelig gammel data

```text
interface CacheOptions {
  key: string;           // Unik nokkel for denne dataen
  maxAge?: number;       // Maks alder i ms (default 24 timer)
}

async function fetchWithOfflineCache<T>(
  fetchFn: () => Promise<T>,
  options: CacheOptions
): Promise<{ data: T; fromCache: boolean }>

function getCachedData<T>(key: string): T | null
function setCachedData<T>(key: string, data: T): void
```

### Steg 3: Oppdater datahenting i sidene

Legge til offline-cache i alle fetch-funksjoner pa de viktigste sidene. Dette gjores ved a wrappe eksisterende Supabase-kall med `fetchWithOfflineCache`, uten a endre sidestruktur:

**Fil: `src/pages/Resources.tsx`**
- `fetchDrones()`: Wrapper med cache-nokkel `offline_drones_{companyId}`
- `fetchEquipment()`: Cache-nokkel `offline_equipment_{companyId}`
- `fetchDronetags()`: Cache-nokkel `offline_dronetags_{companyId}`
- `fetchPersonnel()`: Cache-nokkel `offline_personnel_{companyId}`

**Fil: `src/pages/Oppdrag.tsx`**
- `fetchMissions()`: Cache-nokkel `offline_missions_{companyId}_{filterTab}`

**Fil: `src/pages/Hendelser.tsx`**
- `fetchIncidents()`: Cache-nokkel `offline_incidents_{companyId}`

**Fil: `src/pages/Kalender.tsx`**
- Kalender-data caches med relevant nokkel

**Fil: `src/pages/Status.tsx`**
- Statistikk-data caches

Monsteret i hver fetch-funksjon blir:
```text
const fetchDrones = async () => {
  try {
    const { data, error } = await supabase.from("drones").select("*")...;
    if (error) throw error;
    setDrones(data || []);
    setCachedData(`offline_drones_${companyId}`, data || []);  // <-- ny linje
  } catch (err) {
    // Hvis offline, bruk cachet data
    if (!navigator.onLine) {
      const cached = getCachedData(`offline_drones_${companyId}`);
      if (cached) setDrones(cached);
    }
  }
};
```

### Steg 4: Offline-sikker StartFlightDialog

**Fil: `src/components/StartFlightDialog.tsx`**

- I `useEffect` som henter misjoner: Lagre resultatet med `setCachedData`
- Hvis hentingen feiler og vi er offline: Bruk `getCachedData` for misjonslisten
- Brukeren kan da velge blant sist hentede misjoner nar de starter en flytur offline
- Tilsvarende for dronetag-enheter og sjekklister

### Steg 5: DomainGuard offline-bypass

**Fil: `src/components/DomainGuard.tsx`**

- Legg til sjekk: Hvis `!navigator.onLine`, ikke omdiriger til login-domenet
- Dette forhindrer at offline-brukere blir kastet ut til en login-side de ikke kan na

```text
// I useEffect:
if (!navigator.onLine) {
  console.log('DomainGuard: Offline, skipping redirects');
  return;
}
```

### Steg 6: AuthenticatedLayout offline-tilpasning

**Fil: `src/App.tsx`**

- Nar brukeren er offline og har cachet sesjon: Ikke blokker rendering selv om `isApproved` mangler
- Vis innholdet med offline-banner synlig

```text
const AuthenticatedLayout = () => {
  const { user, loading, isApproved } = useAuth();
  const isOnline = navigator.onLine; // eller useNetworkStatus

  // Offline med gyldig sesjon: vis innhold
  if (!loading && user && !isApproved && !isOnline) {
    // Bruker cachet profil - vis innhold
    return <Layout />;
  }
  
  if (loading || !user || !isApproved) {
    return <Outlet />;
  }
  // ... resten som for
};
```

---

## Nye filer

| Fil | Formal |
|-----|--------|
| `src/lib/offlineCache.ts` | Generisk offline-cache-hjelper med localStorage |

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Cache brukerdata, fallback til cache ved offline |
| `src/components/DomainGuard.tsx` | Skip redirect nar offline |
| `src/App.tsx` | AuthenticatedLayout tillater rendering med cachet auth offline |
| `src/pages/Resources.tsx` | Legg til offline-cache i alle fetch-funksjoner |
| `src/pages/Oppdrag.tsx` | Legg til offline-cache i fetchMissions |
| `src/pages/Hendelser.tsx` | Legg til offline-cache i fetchIncidents |
| `src/pages/Status.tsx` | Legg til offline-cache i fetch-funksjoner |
| `src/pages/Kalender.tsx` | Legg til offline-cache i datahenting |
| `src/components/StartFlightDialog.tsx` | Bruk cachet misjoner nar offline |

---

## Begrensninger

- **Innlogging offline**: Det er teknisk umulig a logge inn nar man er helt offline (krever Supabase-autentisering). Losningen sikrer at brukere som allerede er innlogget forblir innlogget.
- **Sesjonsutlop**: Hvis Supabase-sesjonen utloper mens brukeren er offline, ma de logge inn igjen nar nett er tilbake. Supabase-sesjoner varer typisk 1 time, men auto-refresh fungerer sa lenge nett er tilgjengelig.
- **Sanntidsoppdateringer**: Realtime-subscriptions fungerer ikke offline, men data vises fra cache.
- **localStorage-grense**: Ca 5-10 MB total. For a unnga problemer begrenses cache til de viktigste datasettene.

