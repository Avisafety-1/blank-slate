## Problem

Ved passordbytte kunne bruker bli logget rett inn selv om byttet feilet. Årsak: `supabase.auth.verifyOtp({ type: "recovery" })` oppretter en aktiv sesjon (SIGNED_IN-event). Hvis påfølgende `updateUser({ password })` feilet (typisk ved gjenbruk av tidligere passord eller for svakt passord), ble det aldri kalt `signOut()`. Recovery-sesjonen ble derfor liggende, og brukeren ble auto-innlogget med sitt eksisterende passord.

I tillegg kringkastet `AuthContext` denne transiente recovery-sesjonen til andre faner via BroadcastChannel, som gjorde at også andre åpne faner ble "innlogget" midlertidig.

## Endringer

### `src/pages/ResetPassword.tsx`
- Sett per-tab-flagg `sessionStorage.setItem('avisafe_password_reset_active', '1')` **før** `verifyOtp` kalles i `startVerification`.
- I `handleResetPassword`: kjør `await supabase.auth.signOut({ scope: 'local' })` i `finally`-blokken på **alle** utfall etter vellykket `verifyOtp` (både suksess og feil), slik at recovery-sesjonen aldri blir liggende.
- Ved `updateUser`-suksess: naviger til `/auth` med toast "Passord oppdatert! Logg inn med ditt nye passord.".
- Ved `updateUser`-feil: vis tydelig melding (f.eks. "Kunne ikke oppdatere passord. Lenken er brukt opp — be om ny."), og sett `stage = "resend"` slik at brukeren kan be om ny lenke. Rens også `password`/`confirmPassword`-state.
- Fjern flagget `avisafe_password_reset_active` i `finally` **etter** `signOut`, og også i en `useEffect`-cleanup ved unmount (defensivt, i tilfelle brukeren navigerer bort midt i flyten).

### `src/contexts/AuthContext.tsx`
- I `onAuthStateChange`-handler: ignorer **alle** auth-events (returner tidlig, ingen `setSession`, ingen `broadcastSession`, ingen state-oppdatering) så lenge `sessionStorage.getItem('avisafe_password_reset_active') === '1'`.
- Sjekken må skje helt først i handleren, før eksisterende `ignoreNextAuthEventRef`-logikk og før cross-tab-broadcast.
- Dette hindrer at transient recovery-`SIGNED_IN` og etterfølgende `USER_UPDATED`/`SIGNED_OUT` logger inn appen eller lekker sesjonen til andre faner.

## Ingen andre endringer
- Ingen DB-migrasjoner, ingen edge functions, ingen designendringer.
- `send-password-reset`-edge function er uendret.
- Cross-tab-idempotens (`lastSyncedToken`/`noteSyncedToken`) beholdes uendret.

## Resultat
- Vellykket bytte → bruker havner på `/auth` og må logge inn manuelt med nytt passord.
- Feilet bytte (gjenbruk / svakt passord) → ingen innlogging, brukeren blir bedt om ny lenke.
- Andre åpne faner påvirkes ikke av recovery-flyten.

Replikeres identisk i `app.avisafe.no`.
