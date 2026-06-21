# Fiks: "captcha protection; request disallowed" ved passkey-innlogging

## Rotårsaken

Supabase Auth-prosjektet har captcha-beskyttelse (Cloudflare Turnstile) påslått. Alle auth-endepunkter — inkludert passkey-flyten (`/passkey/authentication/options`) — krever et gyldig `captchaToken`. Vårt `handlePasskeyLogin` kaller `signInWithPasskey()` **uten** captcha-token, og Supabase avviser dermed forespørselen med "captcha protection: request disallowed". Vanlig e-post/passord-innlogging gjør det riktig (linje 376–384) ved å hente token fra Turnstile-widgeten først.

Etter en ny app-versjon (PWA-oppdatering) blir Turnstile-widgeten remountet og må generere et nytt token før knappen kan brukes — derav at feilen ofte oppstår "rett etter publisering".

## Endringer

### `src/pages/Auth.tsx` — `handlePasskeyLogin`

1. Før kall til `signInWithPasskey`, vent på Turnstile-token akkurat som passordflyten:
   - Hvis `captchaStatusRef.current` er `"loading"` eller `"expired"` og det ikke finnes token, sett `waitingForCaptcha=true` og poll i opptil 4 s.
   - Hvis vi etter ventingen fortsatt mangler token og status ikke er `"skipped"`/`"error"` (dvs. captcha er aktiv men ikke ferdig), vis `showCaptchaFallback` + toast "Bekreft at du ikke er en robot og prøv igjen" og avbryt (samme oppførsel som passord-grenen).

2. Send token videre:
   ```ts
   const tokenToSend = captchaTokenRef.current;
   const { data, error } = await (supabase.auth as any).signInWithPasskey(
     tokenToSend ? { options: { captchaToken: tokenToSend } } : undefined
   );
   ```
   (SDK-ens `SignInWithPasskeyCredentials` aksepterer `options.captchaToken` — verifisert i `node_modules/@supabase/auth-js`.)

3. Ved feil i passkey-flyten: kall `resetTurnstile()` + `setCaptchaToken(null)` + `setCaptchaStatus("loading")` slik at neste forsøk får friskt token (samme nullstilling som passordflyten gjør på linje 386–388). Behold eksisterende error-mapping (`NotAllowedError`/`AbortError` stille, osv.).

4. Sørg for at `setPasskeyLoading(false)` og `setWaitingForCaptcha(false)` alltid kjøres via `finally`.

### Ingen endringer i

- Turnstile-widget, captcha-state, eller andre flows.
- Supabase-config, RP ID, edge functions.

## Verifisering

1. Last `/auth` på mobil etter ny PWA-versjon → vent til Turnstile er klar (knappen "Logg inn" kan trykkes) → trykk "Logg inn med passkey" → systemets passkey-UI → logget inn. Ingen "captcha protection"-feil.
2. Trykk passkey-knappen **før** Turnstile er ferdig → kort "venter på captcha"-tilstand, så enten suksess eller fallback-toast hvis det tar >4 s.
3. Avbryt passkey-prompten → fortsatt stille (ingen toast), Turnstile-token nullstilt for nytt forsøk.
4. Desktop Chrome → uendret oppførsel, fortsatt fungerende.

## Tekniske notater

- `signInWithPasskey` videresender `captchaToken` til `_startPasskeyAuthentication`, som er den eneste server-runden i flyten som captcha-gating treffer.
- Vi unngår å duplisere wait-loop-logikken ved å holde den enkelt inline i `handlePasskeyLogin`; den er kort nok. Hvis det blir et tredje sted senere (f.eks. Google OAuth), bør vi trekke ut til en hjelpefunksjon.
