## Mål
Forhindre "captcha verification failed" når brukeren trykker "Logg inn" før Turnstile har rukket å generere token. Gi tydelig feedback (spinner / synlig widget) i stedet for å feile stille.

## Endringer

### 1. `src/components/auth/TurnstileWidget.tsx`
Utvid widgeten til å rapportere status, ikke bare token.

- Legg til ny prop `onStatusChange?: (status: "loading" | "ready" | "skipped" | "error" | "expired") => void`.
- Send status-events:
  - `"loading"` initielt (i useEffect før script lastes).
  - `"skipped"` for DJI-controller (gjeldende `shouldSkipCaptcha()`-gren).
  - `"error"` hvis script feiler å laste eller `render()` kaster.
  - `"ready"` i Turnstile `callback` (samtidig som `onVerify(token)`).
  - `"expired"` i `expired-callback` (token blir også satt til null).
- Legg til ny prop `forceVisible?: boolean`. Når true, render widget med `appearance: "always"` (vis checkboxen). Brukes som fallback hvis captcha henger.
- Eksporter en ny imperativ helper `executeTurnstile()` (kaller `window.turnstile?.execute(widgetId)`) — ikke strengt nødvendig hvis vi bare venter, men nyttig hvis vi vil trigge på nytt.

### 2. `src/pages/Auth.tsx`
Gating av login på captcha-readiness.

- Ny state:
  - `captchaStatus: "loading" | "ready" | "skipped" | "error" | "expired"` (default `"loading"`).
  - `showCaptchaFallback: boolean` (default false) — toggler `forceVisible` på widgeten.
- Send `onStatusChange={setCaptchaStatus}` til `<TurnstileWidget>`.
- Behold eksisterende `onVerify={setCaptchaToken}`.
- I `handleAuth` (login-grenen), før `signInWithPassword`:
  - Hvis `captchaStatus === "ready"` eller `"skipped"` eller `"error"` → fortsett som i dag (`captchaToken` brukes hvis den finnes).
  - Hvis `captchaStatus === "loading"` eller `"expired"`:
    - Sett en lokal `waitingForCaptcha`-state slik at knappen viser spinner + tekst "Verifiserer …".
    - Vent på token via en liten polling-promise (sjekk `captchaStatus`/`captchaToken` hver 100 ms, maks 4 sekunder).
    - Hvis token kommer innen timeout → fortsett login.
    - Hvis timeout → sett `showCaptchaFallback=true` (widgeten blir synlig), vis toast "Bekreft at du ikke er en robot og prøv igjen", `setLoading(false)` og return.
- Submit-knapp:
  - Behold eksisterende `disabled`-betingelser.
  - Når `loading && waitingForCaptcha` vis tekst "Verifiserer …" i stedet for "Logger inn …".
- Etter feilet login (eksisterende `resetTurnstile()` + `setCaptchaToken(null)`):
  - Også `setCaptchaStatus("loading")` så ny ventelogikk fungerer på neste forsøk.

### 3. Ingen endringer
- Backend / Supabase captcha-konfig — uendret.
- DJI skip-flow — uendret (status `"skipped"` lar login fortsette uten å vente).
- Signup/reset-flows — captcha er ikke aktiv der i dag, ingen endring.

## Verifisering
1. Hard refresh `/auth`. Skriv epost+passord og trykk "Logg inn" umiddelbart (<1 s):
   - Knappen viser "Verifiserer …" kort, deretter logger den inn uten feilmelding.
2. Simuler treg captcha (DevTools → Network throttling "Slow 3G", blokker `challenges.cloudflare.com` midlertidig):
   - Etter ~4 s blir Turnstile-boksen synlig under passordfeltet, toast informerer brukeren, ingen Supabase-feil.
3. Normal login (vent 2 s før klikk): uendret oppførsel, ingen synlig widget.
4. Feil passord: `resetTurnstile()` kjører, status går tilbake til `loading`, neste forsøk venter på ny token.
5. DJI-controller (skipped): login fungerer umiddelbart uten venting.
