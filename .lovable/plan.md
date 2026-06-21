# Passkey-knapp alltid synlig + Conditional UI

## Mål
"Logg inn med passkey" skal alltid stå på `/auth` når nettleseren støtter WebAuthn. Ingen skjuling basert på `localStorage` eller annen klienttilstand. I tillegg aktiveres WebAuthn Autofill (Conditional UI) på e-postfeltet slik at telefonen foreslår passkey-en automatisk der det støttes.

## Endringer

### 1. `src/pages/Auth.tsx` — alltid vis knappen
- Fjern `passkeyRegistered`-konstanten (linje 69) som leser `localStorage`.
- Endre render-vilkåret (linje 957) fra
  `isLogin && passkeySupported && passkeyRegistered && !isDevEnv`
  til
  `isLogin && passkeySupported && !isDevEnv`.
- Behold dagens feilhåndtering i `handlePasskeyLogin`. `NotAllowedError` ignoreres stille (brukerens valg). Forbedre fallback-toast til mild norsk tekst: "Fant ingen passkey for denne enheten. Logg inn med passord først og aktiver passkey under Profil."

### 2. `src/pages/Auth.tsx` — Conditional UI / Autofill
- E-postfelt (login-modus): `autoComplete="username webauthn"`.
- Passordfelt: `autoComplete="current-password"` (uten `webauthn` — best practice; passkey skal ikke foreslås i passordfeltet).
- Ny `useEffect` ved mount når `isLogin && passkeySupported && !isDevEnv`:
  1. Sjekk `await PublicKeyCredential.isConditionalMediationAvailable?.()`. Hopp ut hvis ikke støttet (typisk iOS PWA standalone).
  2. Kall `(supabase.auth as any).signInWithPasskey({ mediation: "conditional", signal: controller.signal })`. Hvis Supabase-klienten ikke aksepterer `mediation`-argumentet, faller vi tilbake til ren `navigator.credentials.get({ mediation: "conditional", signal, publicKey: { challenge, rpId, userVerification: "preferred" } })` der challenge hentes via et lett Supabase-kall (eller vi dropper fallback og lar kun Supabase-stien stå hvis den ikke støttes — verifiseres ved implementering).
  3. Suksess → samme redirect som vanlig knapp.
  4. Feil/abort → ignoreres stille (autofill skal være usynlig hvis intet trigges).
- `AbortController` opprettes i effecten og avbrytes ved unmount eller når bruker bytter til registreringsmodus.

### 3. Ingen endring i Profil / PasskeySetup
- `PasskeySetup`-komponenten henter listen fra Supabase og er autoritativ — den fungerer som før.
- `avisafe_passkey_registered`-flagget i `localStorage` brukes fortsatt av `PasskeyPromptDialog` for å unngå gjentatt prompt, og kan bli stående.

## Hva som ikke endres
- Backend / Supabase-konfig.
- Cloudflare / domeneoppsett.
- Dev/preview-gating (Conditional UI og knapp er fortsatt avhengig av `!isDevEnv`).

## Verifisering
1. Desktop Chrome `/auth`: knapp synlig. Trykk → systemets passkey-dialog. Avbryt → ingen toast.
2. iPhone/Android med registrert passkey: tap på e-postfelt → passkey som autofill-forslag.
3. Enhet uten passkey: knapp fortsatt synlig; trykk → systemdialog "ingen passkey", lukk → ingen feil-toast.
4. Oppdater PWA (ny service worker) → knapp fortsatt synlig (uavhengig av `localStorage`).

## Tekniske notater
- Conditional UI krever HTTPS + ekte domene; dev/preview hopper over.
- Supabase JS `signInWithPasskey` er experimental — vi caster til `any` som i dag.
- Ingen nye dependencies.
