# Fix uendelig cross-tab auth-løkke (BroadcastChannel echo)

## Problem
To parallelle faner pinger samme sesjon frem og tilbake via BroadcastChannel i det uendelige ("Received session from another tab" / "Applied cross-tab session" i loop). Dette trigger en storm av `GET /user`-kall.

**Årsak:** `supabase.auth.setSession()` kan emitere flere `onAuthStateChange`-hendelser. Dagens enkle `ignoreNextAuthEventRef`-flagg undertrykker bare én — de resterende hendelsene kaller `broadcastSession()` på nytt, som gir ekko til andre faner, som igjen kaller `setSession`, osv.

## Løsning — token-basert idempotens

### `src/lib/authTabSync.ts`
- Legg til modul-variabel `let lastSyncedToken: string | null = null`.
- `broadcastSession(session)`: return tidlig (no-op) hvis `session.access_token === lastSyncedToken`. Ellers sett `lastSyncedToken = session.access_token` før postMessage.
- Ny eksport `noteSyncedToken(token: string)` som setter `lastSyncedToken = token` — kalles av mottaker-fane før den anvender en innkommende sesjon, slik at den ikke ekkoer tokenet tilbake.

### `src/contexts/AuthContext.tsx`
- Ny `currentAccessTokenRef = useRef<string | null>(null)`, synket via `useEffect` på `session`.
- I `SESSION_UPDATE`-handleren fra `onTabMessage`:
  1. Return umiddelbart hvis `msg.access_token === currentAccessTokenRef.current` (rent ekko).
  2. Ellers: kall `noteSyncedToken(msg.access_token)` FØR `supabase.auth.setSession(...)`.
  3. Oppdater `currentAccessTokenRef.current = msg.access_token` når anvendt.
- Behold eksisterende `ignoreNextAuthEventRef` som sekundær sikring mot dobbelbroadcast fra egen `setSession`-triggede events.

## Verifisering
- Åpne to faner på samme bruker → logg skal vise maks én "Applied cross-tab session" per faktisk token-refresh, ikke kontinuerlig loop.
- Ingen storm av `GET /auth/v1/user` i nettverksfanen.
- Token-refresh fra én fane propagerer fortsatt til den andre (én gang).
- Sign-out fra én fane logger fortsatt ut alle faner.

## Scope
Kun `src/lib/authTabSync.ts` og `src/contexts/AuthContext.tsx`. Ingen DB-endringer, ingen andre komponenter.
