

## Auth-flyt: Treg re-autentisering og problemer ved utlogging/innlogging

### Rotårsakene

Jeg har identifisert tre flaskehalser i `AuthContext.tsx`:

**1. `getUser()` blokkerer profil-lasting (linje 408-426)**
Hver gang `fetchUserInfo` kalles (ved SIGNED_IN, TOKEN_REFRESHED, getSession), kjører den `supabase.auth.getUser()` FØRST — et nettverkskall til Supabase Auth-serveren. Auth-loggene viser at dette kallet tar 0.2–5 sekunder, og opptil 10s ved timeout. Profil- og rolle-queries starter IKKE før dette kallet er ferdig.

Problemet: `getUser()` brukes bare for å sjekke om brukeren er slettet — en svært sjelden edge case som blokkerer den kritiske banen.

**2. Profil-cache slettes ved utlogging (linje 210-243)**
`clearLocalAuthData()` fjerner `PROFILE_CACHE_KEY`. Når brukeren logger inn igjen, returnerer `applyCachedProfile()` false, og UI-en må vente på hele `fetchUserInfo`-kjeden (getUser + profil + rolle + parent company + accessible companies) før admin-ikoner og varsler vises.

**3. Sekvensiell waterfall i fetchUserInfo**
```text
getUser()                          ← 0.2-5s nettverkskall
  → Promise.all([profile, role])   ← ~0.1s
    → parent company fetch         ← ~0.1s (sekvensiell!)
      → fetchAccessibleCompanies   ← ~0.1s (sekvensiell!)
        → checkSubscription        ← Edge function, ~0.5-2s (via useEffect)
```
Total: 1-8 sekunder i verste fall, sekvensielt.

### Løsning

**Endring 1: Flytt `getUser()` ut av den kritiske banen**
- `fetchUserInfo` skal IKKE kalle `getUser()` synkront
- I stedet: kjør deleted-user-sjekk i bakgrunnen (fire-and-forget) etter at profil er lastet
- Profil- og rolle-queries kan starte umiddelbart siden de bruker JWT fra session (RLS)

**Endring 2: Behold profil-cache ved utlogging**  
- `clearLocalAuthData()` skal IKKE slette `PROFILE_CACHE_KEY`
- Cachen er per bruker-ID, så den gjør ingen skade og gir instant profil ved re-login
- Cachen overskrives uansett av fersk data fra `fetchUserInfo`

**Endring 3: Parallelliser parent company + accessible companies**
- Flytt `fetchAccessibleCompanies` og parent company-fetch inn i `Promise.all` sammen med profil og rolle
- Eller kjør dem som fire-and-forget etter at profil er satt

**Endring 4: Invalider getUserCache ved utlogging**
- Sett `getUserCacheRef.current = null` i `clearLocalAuthData` slik at gammel cache ikke blokkerer ny innlogging

### Endringer i kode

**`src/contexts/AuthContext.tsx`:**

1. **`fetchUserInfo`**: Fjern blokkerende `getUser()`-kall. Start profil+rolle queries umiddelbart. Kjør deleted-user-sjekk som fire-and-forget etterpå.

2. **`clearLocalAuthData`**: Fjern linjen som sletter `PROFILE_CACHE_KEY`. Legg til `getUserCacheRef.current = null`.

3. **Parent company + accessible companies**: Kjør `fetchAccessibleCompanies` som fire-and-forget (allerede gjort) og la parent company-fetch skje parallelt der det er mulig.

### Forventet effekt
- Re-login etter utlogging: Profil-cache gir instant admin/varsler fra cached data
- Retur etter lang fravær: Profil-queries starter umiddelbart uten å vente på `getUser()`, sparer 0.2-5s
- Total tid til full autentisering reduseres fra 1-8s til ~0.3-1s

### Risiko
Lav. Deleted-user-sjekken kjører fortsatt, bare asynkront. Profil-cache er allerede per bruker-ID. Ingen RLS- eller sikkerhetsendringer.

