## Mål
Gjøre 2FA-innlogging på mobil enklere ved å støtte autofyll, lim-inn fra utklippstavle, og snarvei til authenticator-app — uten å endre selve MFA-flyten eller backend.

## Endringer i `src/components/MfaChallengeDialog.tsx`

### OTP-inputfelt
- Sette `autoComplete="one-time-code"`, `inputMode="numeric"`, `pattern="[0-9]*"` på OTP-feltet/slotsene. Dette aktiverer autofyll-forslag fra iOS Nøkler, Google Password Manager, 1Password, Bitwarden m.fl.

### Hjelpetekst
- Liten muted-tekst under OTP: "Tips: lim inn koden eller bruk autofyll fra passordmanageren din."

### "Lim inn kode"-knapp
- Vises alltid (over Avbryt/Bekreft).
- Klikk:
  1. `await navigator.clipboard.readText()` i try/catch.
  2. Ved feil/avslag: `toast.error("Kunne ikke lese fra utklippstavlen. Lim inn koden manuelt.")`.
  3. Ved suksess: regex `/\d{6}/` for å finne første 6-sifrede tall (etter at mellomrom er fjernet). Hvis ingen treff: `toast.error("Fant ingen 6-sifret kode i utklippstavlen.")`.
  4. Sett `code`-state til de 6 sifrene. Eksisterende `useEffect` auto-verifiserer som før.

### "Åpne authenticator-app"-knapp
- Best-effort. Kun synlig på touch-enheter: `window.matchMedia('(pointer: coarse)').matches`.
- Klikk: forsøk å åpne kjente schemes via skjult `<a>`/`window.location.href`:
  - Android (`navigator.userAgent` inneholder `Android`): `intent://#Intent;scheme=otpauth;package=com.google.android.apps.authenticator2;end`
  - Ellers/iOS: prøv `googleauthenticator://` først.
- Etter ~800 ms (hvis siden fortsatt er fokusert / dokumentet synlig), vis rolig hint:
  `toast("Fant ingen authenticator-app. Bytt til appen manuelt og kom tilbake hit.")`.
- Ingen feilmelding hvis appen faktisk åpner (dokumentet mister fokus → vi hopper over hintet).

## Det vi *ikke* gjør
- Ingen backend-endringer.
- Ingen endring i Supabase MFA-flyten (`mfa.challenge` / `mfa.verify` uberørt).
- Ingen endring i `TwoFactorSetup.tsx`.
- Ingen lagring av TOTP-koder eller secrets i appen.
- Ingen auto-submit før koden er validert som nøyaktig 6 siffer (eksisterende logikk beholdes).

## Filer som endres
- `src/components/MfaChallengeDialog.tsx` (kun denne).
