## Problem

Feilen «a non-webauthn related error occurred» kommer fra `@simplewebauthn/browser` når Supabase-kallet (ikke selve WebAuthn-ceremonien) feiler. Den dukker oftest opp rett etter en utlogging.

Årsak: Cloudflare Turnstile-tokener er **engangstokener**. I dagens flyt i `src/pages/Auth.tsx`:

- Når brukeren logger inn (passord eller passkey) sendes `captchaTokenRef.current` til Supabase og forbrukes der.
- Etter innlogging blir Turnstile-widgeten stående med status `ready` og samme token i `captchaTokenRef`.
- Ved utlogging blir widgeten i praksis re-mountet, men hvis brukeren rekker å trykke «Logg inn med biometri» før den nye tokenen er klar, sendes enten:
  - den gamle, allerede forbrukte tokenen, eller
  - ingen token (mens Supabase krever én).
- Supabase svarer 4xx/5xx → `signInWithPasskey` kaster en ikke-WebAuthn-feil → SimpleWebAuthn pakker den inn som «a non-webauthn related error occurred».

Det stemmer også med at det skjer «etter å ha logget ut kort tid før», og at vente-løkken bare venter når status er `loading`/`expired` — ikke når status er `ready` med en stale token.

## Løsning

Tving alltid en frisk Turnstile-token før `signInWithPasskey` kalles, og resett widgeten ved utlogging.

### Endringer i `src/pages/Auth.tsx`

1. **I starten av `handlePasskeyLogin`** (før wait-løkken):
   - Hvis `captchaStatusRef.current === "ready"` OG en passkey-login (eller annen login) allerede har blitt forsøkt i denne mount-en, kall `resetTurnstile()`, sett `captchaToken=null` og `captchaStatus="loading"`. Bruk en `usedCaptchaRef` (boolean) som settes `true` rett før hvert Supabase-kall som sender captchaToken, og som sjekkes her.
   - Wait-løkken vil dermed kjøre og vente på en ny token (opptil 4 s) før kallet til Supabase.

2. **Samme `usedCaptchaRef`-sjekk i `handleLogin`** (passord-flyten linje ~352) for konsistens, slik at heller ikke passord-innlogging gjenbruker token etter logout→login.

3. **Lytte på `SIGNED_OUT`-event**: I `AuthContext` (eller en liten `useEffect` i `Auth.tsx` som lytter via `supabase.auth.onAuthStateChange`) kalle `resetTurnstile()` + nullstille `captchaToken`/`captchaStatus` når `event === "SIGNED_OUT"`. Dette sikrer at widgeten faktisk genererer en ny token før neste forsøk.

4. **Bedre feilmelding**: Når `err?.message` matcher «non-webauthn related» eller `err?.status` er 4xx fra Supabase, vis en mer presis toast:
   «Sikkerhetstoken utløpt. Vent et øyeblikk og prøv igjen.» i stedet for den generiske teksten.

### Ingen endringer

- `TurnstileWidget.tsx` — uendret. `resetTurnstile()` finnes allerede.
- Ingen DB- eller edge function-endringer.

## QA

- Logg inn med passkey → logg ut → trykk «Logg inn med biometri» umiddelbart. Skal nå vente kort på ny token og lykkes, ikke kaste «non-webauthn related».
- Logg inn med passord → logg ut → logg inn med passkey. Samme oppførsel.
- Normal første-gangs passkey-innlogging skal fungere uendret (ingen ekstra ventetid når tokenen allerede er fersk og ubrukt).
