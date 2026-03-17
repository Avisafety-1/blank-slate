

## Rotårsak: Ingen aktiv sesjonsgjenoppretting ved retur fra bakgrunn

### Bevis fra loggene

Auth-loggene viser det eksakte problemet:
- `POST /token` (refresh_token) tok **11 sekunder** og returnerte en **504 timeout** før den til slutt lyktes. Feilen: `"error finding user: write tcp ... i/o timeout"` — Supabase sin auth-server mistet forbindelsen til Postgres.
- Nettverksloggene viser **5+ simultane `GET /auth/v1/user`-kall** innen få sekunder etter gjenopprettelse.

### Hva skjer steg for steg

```text
1. PWA i bakgrunn i 30+ min
2. Bruker åpner appen igjen
3. Supabase SDK sin autoRefreshToken prøver /token → tar 5-11s (504, retry)
4. I mellomtiden: JWT er utløpt, RLS-spørringer returnerer tomme resultater
5. profileLoaded = false → UI viser loading-spinner
6. Ingen visibilitychange-handler i AuthContext → ingen aktiv gjenopprettelse
7. Til slutt lykkes token-refresh → TOKEN_REFRESHED → fetchUserInfo → UI dukker opp
```

Det finnes en `visibilitychange`-handler i `OpenAIPMap.tsx` for kartlag, men **ingen i AuthContext** som aktivt gjenoppretter sesjonen.

### Tre problemer

**1. Ingen proaktiv sesjonsgjenoppretting (hovedårsaken)**
AuthContext har ingen `visibilitychange` eller `online`-lytter. Appen venter passivt på at SDK-ens timer-baserte auto-refresh skal kjøre, noe som kan ta 10-20s etter lang bakgrunnstid.

**2. `getUser()`-storm vedvarer**
Selv etter optimaliseringene, kaller multiple steder `supabase.auth.getUser()` uavhengig:
- `backgroundUserCheck()` i AuthContext
- `supabase.auth.getUser()` i OpenAIPMap (linje 529)
- `ensureValidToken()` fra Calendar, Admin, IncidentDetail, DocumentDetail
- `checkSubscription` via useEffect

Hvert kall er et nettverksrequest som tar 2-60ms og konkurrerer om nettverksressurser.

**3. `ensureValidToken()` bruker `getUser()` i stedet for `getSession()`**
`getUser()` er et nettverkskall. `getSession()` er en lokal sjekk som automatisk trigger refresh ved behov — mye raskere.

### Løsning

**Endring 1: Legg til visibilitychange + online handler i AuthContext**

Når brukeren returnerer til appen etter >5 sekunder i bakgrunnen, kall `supabase.auth.getSession()` for å tvinge en token-refresh. Hvis sesjonen er gyldig, re-kjør `fetchUserInfo`. Samme logikk ved `online`-event.

```typescript
// I AuthContext useEffect:
const handleVisibilityChange = () => {
  if (document.visibilityState !== 'visible') {
    lastHiddenAt = Date.now();
    return;
  }
  if (Date.now() - lastHiddenAt < 5000) return;
  
  // Force session check → triggers TOKEN_REFRESHED if needed
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      setSession(session);
      setUser(session.user);
      deduplicatedFetchUserInfo(session.user.id);
    }
  });
};
```

**Endring 2: Fjern `getUser()` fra kartet**

OpenAIPMap linje 529 kaller `supabase.auth.getUser()` før datalasting. Dette er unødvendig fordi AuthContext allerede har validert sesjonen. Erstatt med direkte kall av alle fetchers.

**Endring 3: Endre `ensureValidToken()` til å bruke `getSession()`**

Bytt fra nettverksbasert `getUser()` til lokal `getSession()` med samme dedupliseringslogikk. Beholder deleted-user-sjekken som en sjelden bakgrunnsjobb.

**Endring 4: Fjern redundant `getUser()`-kall fra `checkSubscription` flow**

`checkSubscription` triggeres av `session`-endringer. Sesjonen er allerede validert — ingen ekstra auth-sjekk nødvendig.

### Filer som endres

- `src/contexts/AuthContext.tsx`: Legg til visibilitychange/online handler, refaktorer ensureValidToken
- `src/components/OpenAIPMap.tsx`: Fjern getUser()-wrapperen rundt datalasting

### Forventet effekt

- Gjenopprettelse fra bakgrunn: **<1 sekund** i stedet for 10-20s
- Antall `/user`-kall per gjenopprettelse: fra 5+ til 0-1
- Admin, kartlag og varsler vises umiddelbart fra cache, oppdateres i bakgrunnen

### Risiko

Lav. `getSession()` er den anbefalte måten å sjekke sesjonsstatus på. Deleted-user-sjekken bevares som bakgrunnsjobb. Kartdata-fetchers bruker JWT via RLS som Supabase-klienten håndterer automatisk.

