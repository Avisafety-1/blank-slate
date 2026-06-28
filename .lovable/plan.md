## Mål
Skru av captcha-verifisering i innlogging uten å fjerne eksisterende kode, så det enkelt kan slås på igjen senere.

## Endringer (kun `src/pages/Auth.tsx`)

1. Legg til én feature-flagg øverst i filen:
   ```ts
   const CAPTCHA_ENABLED = false;
   ```

2. Bruk flagget til å hoppe over captcha-logikken — selve koden står urørt:
   - I `ensureFreshCaptcha`: `return` tidlig hvis `!CAPTCHA_ENABLED`.
   - I passord-login-flyten (rundt linje 400–445): hopp over vente-løkken og send aldri `captchaToken` til `supabase.auth.signInWithPassword` når flagget er av (`options: undefined`).
   - I passkey-login-flyten (rundt linje 736–795): samme — hopp over vente-løkken og kall `signInWithPassword`/passkey-kallet uten `captchaToken`.
   - Ikke vis `<TurnstileWidget>` og "venter på captcha"-tekst (linje ~1060–1070) når flagget er av.

3. Behold:
   - `TurnstileWidget`-komponenten, `shouldSkipCaptcha` i `deviceDetection.ts`, all state (`captchaToken`, `captchaStatus`, `showCaptchaFallback`, `waitingForCaptcha`), refs og hjelpefunksjoner.
   - Captcha-feilmeldings-håndteringen (`isCaptchaIsh`) som no-op sikkerhetsnett.

## Hva som IKKE endres
- Ingen sletting av filer eller komponenter.
- Ingen endringer i `TurnstileWidget.tsx` eller `deviceDetection.ts`.
- Ingen Supabase-migrasjoner.

## Reaktivering senere
Sett `CAPTCHA_ENABLED = true` igjen, så er flyten tilbake som før.
