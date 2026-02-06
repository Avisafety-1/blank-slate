

# Fix: Rotarsaken til at data forsvinner ved offline-oppdatering

## Er offline i PWA realistisk?

Ja, absolutt. PWA-er er designet for offline-bruk. Problemet her er en spesifikk bug i koden, ikke en teknisk begrensning.

## Rotarsaken funnet

Problemet ligger i `fetchUserInfo()` i `AuthContext.tsx` (linje 213-281). Her er hva som skjer steg for steg nar du oppdaterer siden offline:

```text
1. Siden lastes pa nytt
2. AuthContext initialiseres: user=null, companyId=null
3. Supabase finner session fra localStorage (selv offline)
4. user settes til session-brukeren
5. fetchUserInfo() kalles
6. Supabase-sporringer kjorer (profiles, user_roles)
7. Offline: fetch() feiler, men Supabase KASTER IKKE feil
   -> Returnerer { data: null, error: {...} }
8. Promise.all FULLFORERES (ikke avviser)
9. catch-blokken kjorer ALDRI
10. profileResult.data er null
11. profileData far standardverdier: companyId = null
12. setCompanyId(null) -- OVERSKRIVER riktig companyId!
13. saveCachedProfile(userId, { companyId: null, ... })
    -- ODELEGGER den gode profil-cachen!
14. Alle cache-oppslag bruker feil nokkel:
    offline_drones_null i stedet for offline_drones_abc123
15. Ingen data finnes -> tomme lister
```

Dette er hele arsaken. Fordi `companyId` blir `null`, matcher ingen cache-nokler, og alle sider viser tom data.

## Sekundare problemer

### Problem 2: onAuthStateChange setter user uten companyId

Nar `INITIAL_SESSION` mottas med en gyldig sesjon (fra localStorage), setter koden `user` men IKKE `companyId`. Dette skaper et vindu der komponenter kjorer med `companyId=null`:

```text
// Nuvarende kode (linje 171-183):
else {
  setUser(session?.user ?? null);  // user settes
  setLoading(false);               // companyId forblir null!
  // Ingen applyCachedProfile() her
}
```

### Problem 3: Index.tsx auth-redirect mangler offline-guard

```text
// Index.tsx linje 217-221:
if (!loading && !user) {
  navigate("/auth");  // Kan omdirigere offline!
}
// Mangler: && navigator.onLine
```

---

## Losning

### Fix 1: fetchUserInfo() - Early return ved offline (HOVEDFIX)

Legg til offline-sjekk pa toppen av `fetchUserInfo()` slik at den aldri gjor nettverkskall offline, men i stedet umiddelbart laster fra profil-cachen:

```text
const fetchUserInfo = async (userId: string) => {
  // NYTT: Offline guard - bruk cachet profil direkte
  if (!navigator.onLine) {
    applyCachedProfile(userId);
    return;
  }

  try { ... }  // Resten forblir uendret
};
```

I tillegg, legg til en sikkerhet i try-blokken: hvis Supabase-resultatene har feil, bruk cache i stedet for a overskrive med null:

```text
try {
  const [profileResult, roleResult] = await Promise.all([...]);
  
  // NYTT: Hvis begge resultatene har feil, bruk cache
  if (profileResult.error && roleResult.error) {
    applyCachedProfile(userId);
    return;
  }
  
  // Resten forblir uendret...
} catch (error) { ... }
```

### Fix 2: onAuthStateChange - Sett companyId umiddelbart

Oppdater de to stedene der `user` settes uten `companyId`:

**a) `onAuthStateChange` SIGNED_IN-handler**: Legg til offline-sjekk for som bruker cachet profil i stedet for a kalle `fetchUserInfo()`.

**b) `onAuthStateChange` else-handler** (INITIAL_SESSION): Nar offline og session finnes, kall `applyCachedProfile()` umiddelbart slik at `user` og `companyId` settes i samme render-batch.

**c) `getSession().then()` handler**: Sjekk online-status for `fetchUserInfo` kalles. Hvis offline, bruk `applyCachedProfile()` i stedet.

### Fix 3: Index.tsx auth-redirect

Legg til `&& navigator.onLine` i auth-redirect-sjekken pa Index.tsx, samme monsteret som allerede er brukt i Resources.tsx, Oppdrag.tsx, Hendelser.tsx og Documents.tsx.

---

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Offline-guard i `fetchUserInfo()` + error-sjekk + `applyCachedProfile()` i event-handlers |
| `src/pages/Index.tsx` | Legg til `&& navigator.onLine` i auth-redirect |

Kun 2 filer trenger endring. Alle de andre filene (Resources, Oppdrag, osv.) har allerede riktig cache-first logikk -- de feiler bare fordi `companyId` er null.

---

## Forventet flyt etter fix

```text
1. Bruker er online -> data hentes, caches, companyId lagres i profil-cache
2. Bruker gar offline -> OfflineBanner vises
3. Bruker oppdaterer siden offline:
   a. AuthContext starter
   b. Supabase finner session fra localStorage
   c. user settes + applyCachedProfile() -> companyId settes UMIDDELBART
   d. React rendrer med bade user OG companyId satt
   e. Komponentenes useEffects kjorer med riktig companyId
   f. Cache-oppslag bruker riktig nokkel: offline_drones_abc123
   g. Data lastes fra cache -> alt vises korrekt
4. Bruker navigerer mellom sider -> samme monsteret, data forblir synlig
5. Bruker far nett igjen -> ferske data hentes, cacher oppdateres
```

