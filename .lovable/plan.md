

## Plan: Fiks multi-tab auth med BroadcastChannel

### Problemet
Supabase bruker **rotating refresh tokens** — når én fane refresher tokenet, blir det gamle refresh-tokenet ugyldig. Hvis en annen fane prøver å refreshe med det nå-ugyldige tokenet, feiler det og brukeren blir logget ut. Auth-loggene bekrefter dette: `token_revoked` skjer samtidig med `login` fra en annen fane.

### Løsningen
Bruk `BroadcastChannel` til å koordinere token-refresh mellom faner. Én fane gjør selve refreshen, og broadcaster den nye sesjonen til alle andre faner.

### Filer som endres

#### 1. Ny fil: `src/lib/authTabSync.ts`
Sentralisert tab-synkronisering med BroadcastChannel:

- **Session broadcast**: Når en fane får `TOKEN_REFRESHED` eller `SIGNED_IN`, broadcaster den sesjonen til andre faner via `BroadcastChannel('avisafe-auth')`.
- **Session receive**: Andre faner lytter og kaller `supabase.auth.setSession()` med det nye tokenet i stedet for å refreshe selv.
- **Sign-out broadcast**: Når en fane logger ut, broadcaster den `SIGNED_OUT` til alle faner.
- **Refresh lock**: Før en fane kaller `refreshSession()`, sjekker den om en annen fane allerede har refreshet nylig (via `localStorage` timestamp). Hvis ja, henter den bare sesjonen fra storage i stedet.

```text
Tab A                          Tab B
  │                              │
  ├─ token expires               │
  ├─ refreshSession()            │
  ├─ gets new token              │
  ├─ broadcast({session})  ───►  ├─ receives broadcast
  │                              ├─ setSession(newSession)
  │                              ├─ skips own refresh
```

#### 2. Oppdater: `src/integrations/supabase/client.ts`
- Importer `authTabSync` og bruk den i `ensureFreshSession()`:
  - Sjekk om en annen fane nylig har refreshet (localStorage-basert lock med timestamp)
  - Hvis ja: hent sesjon fra `supabase.auth.getSession()` (som leser fra localStorage, allerede oppdatert av den andre fanen)
  - Hvis nei: gjør refresh og broadcast resultatet

#### 3. Oppdater: `src/contexts/AuthContext.tsx`
- I `onAuthStateChange`:
  - Ved `TOKEN_REFRESHED` og `SIGNED_IN`: broadcast sesjonen til andre faner
  - Ved `SIGNED_OUT`: broadcast sign-out
- Legg til BroadcastChannel-listener som mottar sesjoner fra andre faner og kaller `setSession()`/`setUser()` uten å trigge ny refresh
- Ignorer `TOKEN_REFRESHED`-events som kom fra en broadcast (for å unngå uendelig loop)

### Teknisk detalj

```typescript
// authTabSync.ts — kjernekonsept
const channel = new BroadcastChannel('avisafe-auth');
const REFRESH_LOCK_KEY = 'avisafe_refresh_lock';
const LOCK_TTL = 5000; // 5 sekunder

export function broadcastSession(session: Session) {
  channel.postMessage({ type: 'SESSION_UPDATE', session });
  localStorage.setItem(REFRESH_LOCK_KEY, Date.now().toString());
}

export function broadcastSignOut() {
  channel.postMessage({ type: 'SIGNED_OUT' });
}

export function isRefreshLockedByOtherTab(): boolean {
  const lock = localStorage.getItem(REFRESH_LOCK_KEY);
  if (!lock) return false;
  return Date.now() - parseInt(lock) < LOCK_TTL;
}

export function onTabMessage(callback: (msg) => void) {
  channel.onmessage = (e) => callback(e.data);
}
```

**Fallback**: Hvis nettleseren ikke støtter `BroadcastChannel` (eldre Safari), faller det tilbake til dagens oppførsel uten synkronisering.

### Hva dette fikser
- To faner åpne samtidig vil ikke lenger kaste hverandre ut
- Refresh-token revocation unngås fordi kun én fane refresher om gangen
- Sign-out i én fane logger ut alle faner

