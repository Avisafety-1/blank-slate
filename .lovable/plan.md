## Hvorfor blinker det

Når brukeren returnerer til en fane der både access-token og refresh-token er utløpt, ender appen i en oscillasjon mellom dashbord (`/`) og login (`/auth`). Det skjer fordi flere lag forsøker å "redde" sesjonen i stedet for å logge brukeren ut én gang:

1. `supabase.auth.getSession()` returnerer fortsatt et lagret session-objekt fra localStorage — Supabase sjekker ikke utløp her.
2. `AuthContext.applyCachedProfile()` setter `user` + `isApproved=true` fra cache → `Index` rendrer dashbord.
3. `refreshAuthState()` kjører i bakgrunnen. PostgREST svarer 401. `fetchWithRetry` kaller `ensureFreshSession()` → `supabase.auth.refreshSession()` → feiler med `refresh_token_not_found` / `invalid_grant`, men **uten å logge ut** — bare `console.warn`.
4. Supabase kan emitte `SIGNED_OUT` like etter → `resetAuthState()` setter `user=null` → `Index` redirecter til `/auth`.
5. På `/auth` finner Google-OAuth-effekten en restsesjon (eller en annen fane broadcaster en gammel session via BroadcastChannel) → `redirectToApp('/')` → tilbake til dashbord.
6. Steg 2 gjentar seg → blink hvert 0,5–1 sekund.

I tillegg behandler `else`-grenen i `onAuthStateChange` "null session + user fortsatt satt" som "transient refresh" og bevarer state — det er riktig under en ekte token-rotasjon, men feil når refresh faktisk har slått feil permanent.

## Hva vi endrer

### 1. `src/integrations/supabase/client.ts` — `ensureFreshSession`
- Klassifiser feilen fra `refreshSession()`. Hvis meldingen/koden indikerer permanent feil (`refresh_token_not_found`, `invalid_grant`, `Invalid Refresh Token`, `Refresh Token Not Found`, HTTP 400/401 fra `/token`), kaller vi en ny eksportert helper `forceFullSignOut()` i stedet for å bare kaste videre.
- `forceFullSignOut()`:
  - Fjerner alle `sb-*-auth-token`-nøkler + `avisafe_session_cache` + `avisafe_query_cache` fra localStorage.
  - Kaller `supabase.auth.signOut({ scope: 'local' })`.
  - Broadcaster `SIGNED_OUT` til andre faner.
  - Hvis vi ikke allerede er på `/auth`, gjør `window.location.replace('/auth?expired=1')` — hard navigasjon dropper alle in-flight queries/timers og forhindrer at React-state restaurerer dashbordet.

### 2. `src/contexts/AuthContext.tsx`
- I oppstartsblokken `supabase.auth.getSession().then(...)`: hvis `isTokenStale(session)` og påfølgende `refreshSession()` kaster (eller returnerer `error`), kall `forceFullSignOut()` i stedet for å fortsette med `refreshAuthState`. Det stopper hele kjeden i steg 2–3.
- I `refreshAuthState` sin `catch`-blokk: hvis feilen er en 401/JWT-feil og vi er online, kall `forceFullSignOut()`.
- I `else`-grenen i `onAuthStateChange` (linje 887–908): behold "ignorer transient null", men legg til en teller — hvis vi får >2 null-session-eventer innen 3 sekunder, betrakt det som permanent og kall `forceFullSignOut()`. Det bryter loopen hvis Supabase pingponger.
- Fjern auto-redirect-til-`/`-logikken fra `Auth.tsx` (linje 150) ved feilende profilsjekk — den driver punkt 5 i loopen. Når profilsjekken feiler permanent skal vi vise login-skjemaet, ikke redirecte tilbake til app.

### 3. `src/pages/Auth.tsx`
- Les `?expired=1` fra URL ved mount og vis en vennlig toast: *"Du ble logget ut fordi økten utløp. Logg inn på nytt."*
- I `checkGoogleUserProfile`: ikke kall `redirectToApp('/')` ved profil-feil to ganger på rad — vis heller en feilmelding. Dette dreper ping-pong-redirecten.

### 4. `src/hooks/useIdleTimeout.ts`
- I `handleLogout`: etter `signOut()`, gjør også `window.location.replace('/auth?expired=1')` slik at vi ikke er avhengige av at en `useEffect` redirecter — sluttresultatet er deterministisk og en gang.

### 5. Loopdetektor (sikkerhetsnett) — ny fil `src/lib/authLoopGuard.ts`
- Holder en liten ring-buffer i `sessionStorage` med tidsstempler for hver overgang `/` ↔ `/auth`. Hvis >4 overganger innen 4 sekunder, kall `forceFullSignOut()` og vis toast: *"Vi oppdaget en innloggingsløkke og logget deg helt ut. Logg inn på nytt."*
- Hooken brukes i `AuthenticatedLayout` (registrerer dashbord-trykk) og `Auth.tsx` (registrerer login-trykk).

## Tekniske detaljer

- "Permanent feil" matches case-insensitiv på `message`, `error_description`, `code` og `status` (400/401) — samme mønster som eksisterende `isMissingAuthUserError`.
- `forceFullSignOut()` er idempotent (guard via modul-lokal boolean) slik at flere samtidige 401-er kun trigger én utlogging/redirect.
- BroadcastChannel `SIGNED_OUT`-meldingen som allerede sendes fra `AuthContext` håndteres uendret i andre faner.
- Ingen DB- eller backendendringer.

## Hva brukeren vil oppleve

I stedet for blinkende skjerm: ett kort hopp til login med en gul toast som forklarer at økten utløp. Ingen restaurert dashbord-flash, ingen videre redirect.
