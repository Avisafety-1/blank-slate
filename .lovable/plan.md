# Plan: Konsolider auth-origin til `app.avisafe.no` (slank versjon)

Mål: `app.avisafe.no` blir einaste reelle auth/app-origin. `login.avisafe.no` blir att som teknisk fallback (Lovable Primary-domain 301 → app), så gamle bokmerke og e-postlenker held fram å fungere.

## Filer som blir endra

### 1. `src/pages/Auth.tsx`
- Linje 359: `emailRedirectTo: 'https://login.avisafe.no/auth'` → `'https://app.avisafe.no/auth'`
- Linje 386: same endring
- Linje 204 og 443: oppdater kommentar-tekst slik at han ikkje lyg om split-domene-oppsettet
- (Behald `redirectToApp('/')`-kalla — dei er trygge no når begge domena endar på app)

### 2. `supabase/functions/send-password-reset/index.ts`
- Linje 52: `redirectTo: 'https://login.avisafe.no/reset-password'` → `'https://app.avisafe.no/reset-password'`
- Linje 58: `https://login.avisafe.no/reset-password?...` → `https://app.avisafe.no/reset-password?...`

### 3. `supabase/functions/webauthn/index.ts`
- Behald `https://login.avisafe.no` i `ALLOWED_ORIGINS` (linje 20) — då fungerer eksisterande passkeys som er registrerte på login-domenet framleis viss nokon kjem inn der før 301-redirect.
- Ingen endring nødvendig. Berre dokumenter det.

### 4. `src/components/DomainGuard.tsx`
- Fjern `redirectToApp('/')`- og `redirectToLogin('/auth')`-kalla i `useEffect` (linje 37–48).
- Fjern dei to "skal redirecte"-blokkene på linje 65 og 68 som returnerer `null`.
- Komponenten blir då ein rein pass-through wrapper. Importen av `isLoginDomain/isAppDomain/redirectTo*` blir ståande ubrukt — fjern dei òg.
- IKKJE fjern `<DomainGuard>`-wrapparen frå `App.tsx`. Det held diffen liten og fasen reversibel.

### 5. `src/config/domains.ts`
- Ingen endring. Konstantar og `redirectToApp`/`getAppUrl` blir framleis brukt frå `Auth.tsx`.

## Kva som IKKJE skal rørast

- Supabase Auth-innstillingar (Site URL, Redirect URLs) — ingen endring.
- Cookie-domene / `.avisafe.no`-cookie — ikkje innført.
- `login.avisafe.no` i Lovable Custom Domains — blir verande som Primary-redirect target.
- Datamodell, RLS, edge-funksjonar utanom dei to over.
- `EmailTemplateEditor.tsx` linje 616 — det er berre eit `reset_link`-demo i preview, ikkje funksjonelt.
- App.tsx route-tre.
- localStorage / session-handtering / `authTabSync`.

## Testpunkter etterpå

1. **Innlogging frå `app.avisafe.no/auth`**: login med e-post/passord → blir verande på app-domenet, lander på `/` utan loop.
2. **Innlogging via passkey**: registrering og bruk på `app.avisafe.no` fungerer.
3. **Registrering / signup**: bekreftings-e-post peikar på `https://app.avisafe.no/auth`; å klikke loggar deg inn og lander på `/`.
4. **Passord-reset**: e-postlenka peikar på `https://app.avisafe.no/reset-password?token_hash=...&type=recovery`; å klikke lèt deg sette nytt passord.
5. **`login.avisafe.no` i nettlesar**: blir 301 til `app.avisafe.no` (Lovable Primary). Ingen kvit skjerm.
6. **Gammal reset-lenke** (sendt før denne endringa, peikar på `login.avisafe.no/reset-password?...`): følgjer 301 → app.avisafe.no/reset-password med samme query → fungerer (`ResetPassword.tsx` les `token_hash`/`type` frå URL-en).
7. **Uinnlogga brukar på `app.avisafe.no/`**: blir sendt til `/auth` av eksisterande `RequireAuth`/route-logikk, IKKJE til `login.avisafe.no`.
8. **MFA-flow og Google OAuth**: ingen redirect-loop, loginSuccess-toast vert vist éin gong.

## Rollback

Reverter den eine commit-en. `login.avisafe.no` har vore live heile tida, så ingenting går tapt.
