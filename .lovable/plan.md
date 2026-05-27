## Problem

Brukere med verifisert TOTP-faktor slipper unna MFA-utfordring ved Google-innlogging. Supabase håndhever ikke MFA selv — det er appens ansvar — og dagens sjekk i `src/pages/Auth.tsx` har hull:

1. Sjekken ligger **bare** på `/auth`-siden. Hvis OAuth-callbacken redirecter brukeren rett inn i appen (eller domeneswitch fra login → app skipper `/auth`), kjøres den aldri.
2. `checkGoogleUserProfile` og det "vanlige" redirect-loopen har duplisert AAL-logikk som kan race hverandre.
3. `isOAuthUser`-deteksjonen er skjør (`provider === 'google'`) — brukere som har koblet Google til en eksisterende e-postkonto kan ha `provider: 'email'` og falle i feil gren.

## Mål

Garantere at **enhver bruker med en verifisert TOTP-faktor må fullføre MFA-utfordringen før de får tilgang til app-innholdet**, uavhengig av innloggingsmetode eller hvilken side de lander på.

## Løsning: flytt MFA-gating ut av `/auth` og inn i app-shellen

Legg en sentral AAL-guard i `src/App.tsx` (`AuthenticatedLayout`) eller en ny `MfaGate`-wrapper rundt `<SubscriptionGate>`. Da spiller det ingen rolle hvilken rute eller hvilket domene brukeren ankommer.

### Logikk i `MfaGate`

```text
on user load / on auth state change:
  if (!user || authRefreshing) return passthrough;
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1'):
     render <MfaChallengeDialog open forceModal />
     block children until verify success → re-fetch aal → aal2
  else: passthrough
```

- Cache resultatet per sesjon (re-sjekk ved `SIGNED_IN`, `TOKEN_REFRESHED`, og en gang ved mount).
- Ved suksess: `MfaChallengeDialog` lukker, layout rendrer barn.
- Ved Avbryt / lukk: kall `supabase.auth.signOut()` — brukeren skal ikke kunne klikke seg forbi.

### Endringer i `src/pages/Auth.tsx`

- Behold den eksisterende MFA-dialogen som "early prompt" på login-siden (god UX), men **fjern den som eneste forsvarslinje**.
- Forenkle: fjern duplisert AAL-logikk i de to `useEffect`-ene; stol på at `MfaGate` fanger opp alt etter redirect.
- Fjern den skjøre `isOAuthUser`-grenen som splitter MFA-håndtering.

### `src/components/MfaChallengeDialog.tsx`

- Legg til `forceModal`-prop som skjuler "Avbryt"-knappen og logger ut ved escape/lukk. Brukes når dialogen rendres fra `MfaGate`.
- Ingen endringer i selve TOTP-verifiseringen.

## Det vi *ikke* gjør

- Ingen endring i Supabase MFA-flyten (`mfa.challenge` / `mfa.verify` uberørt).
- Ingen endring i `TwoFactorSetup.tsx`.
- Ingen påtvunget enrollment av TOTP — dette dekker kun brukere som **allerede har** TOTP registrert. (Vi kan diskutere påtvunget enrollment separat hvis ønskelig.)
- Ingen backend-/RLS-/migrasjons-endringer.

## Filer som endres

- `src/App.tsx` — wrap layout med `<MfaGate>` (eller inline-logikk i `AuthenticatedLayout`).
- `src/components/MfaGate.tsx` — ny fil.
- `src/components/MfaChallengeDialog.tsx` — legg til `forceModal`-prop.
- `src/pages/Auth.tsx` — rydd opp duplisert MFA-logikk.

## Verifisering etter implementering

1. Logg inn med Google på `hauggard@gmail.com` → MFA-dialog skal komme uansett hvilken side man lander på.
2. Logg inn med e-post/passord → uendret oppførsel (MFA-dialog kommer).
3. Bruker uten TOTP-faktor → går rett inn (uendret).
4. Sjekk auth-loggen: et `/factors/.../verify`-kall skal finnes etter hver Google-login for kontoer med TOTP.
