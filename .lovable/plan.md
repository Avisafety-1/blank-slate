# Fiks: "Passkey ikke konfigurert" på telefon selv om den er konfigurert

## Rotårsaken

Etter å ha gravd i `@supabase/auth-js` (v2.105) viser det seg at vår nye Conditional UI-effekt i `Auth.tsx` (linje 696–725) er feilimplementert:

- `supabase.auth.signInWithPasskey()` aksepterer **ikke** `mediation`-feltet. SDK-en bryr seg bare om `options.captchaToken` og `options.signal`. Alt annet ignoreres.
- Det betyr at "conditional" autofill-effekten vår faktisk starter en **vanlig modal WebAuthn-ceremoni** ved sidelast — ikke en stille autofill-forespørsel.
- På mobil starter dermed en passkey-dialog automatisk. Når brukeren lukker den (eller den feiler), kaster `webAuthnAbortService` den interne aborten. Når brukeren så trykker "Logg inn med passkey", starter en ny ceremoni — og avhengig av timing/feilkode fra serveren (f.eks. `_startPasskeyAuthentication` returnerer feil før WebAuthn-promptet) får brukeren vår generiske "Fant ingen passkey for denne enheten"-toast, selv om enheten faktisk har en passkey.

I tillegg gjør toast-teksten ("Fant ingen passkey ... logg inn med passord først") feilen verre — den antyder feil årsak. All ikke-`NotAllowedError` får samme tekst, så server-/nettverksfeil ser ut som "passkey mangler".

## Endringer

### 1. `src/pages/Auth.tsx` — Fjern den ødelagte Conditional UI-effekten

Slett hele `useEffect` på linje 696–725. Begrunnelse:
- Den implementerer ikke ekte Conditional UI fordi SDK-en ikke støtter `mediation: "conditional"` direkte.
- Den trigger en uventet WebAuthn-prompt ved sidelast på mobil — sannsynlig direkte kilde til feilmeldingen brukeren ser.
- Ekte Conditional UI krever en egen flyt (hent challenge via `passkey.startAuthentication`, kall `navigator.credentials.get({ mediation: "conditional", ... })`, verifiser med `passkey.verifyAuthentication`). Det kan vi legge til senere som egen forbedring, men holdes utenfor denne fiksen for å redusere risiko.

Resultat: passkey-knappen er fortsatt alltid synlig, men ingenting skjer før brukeren trykker på den. Det matcher iOS/Android sin egen "klikk-for-å-bruke-passkey"-modell og er trygt i PWA.

### 2. `src/pages/Auth.tsx` — Bedre feilhåndtering i `handlePasskeyLogin`

Erstatt linje 685–693 slik at vi:
- Logger `err.name`, `err.code`, `err.message`, `err.status` til console (synlig i Lovable-logs for debugging).
- Differensierer toast-tekster:
  - `NotAllowedError` → fortsatt stille (bruker kansellerte eller ingen matchende passkey i system-UI).
  - `SecurityError` / `InvalidStateError` → "Passkey kunne ikke brukes på denne enheten akkurat nå. Prøv igjen eller bruk passord."
  - `AbortError` → stille.
  - Annet (server-/nettverksfeil) → vis faktisk `err.message` hvis tilgjengelig, ellers en nøytral "Innlogging med passkey feilet. Prøv igjen eller bruk passord." Ingen påstand om at passkey "ikke er konfigurert".

### 3. Ingen endringer i

- `PasskeySetup.tsx` / `PasskeyPromptDialog.tsx` — registreringsflyt fungerer.
- Supabase-konfig, edge functions, RP ID (`app.avisafe.no`) — uendret.
- Autofill-attributter på input-feltene beholdes (`autoComplete="username webauthn"`); de skader ikke selv uten aktiv conditional-call.

## Verifisering

1. Last `/auth` på telefon (PWA og Safari/Chrome): **ingen** passkey-dialog skal poppe opp automatisk.
2. Trykk "Logg inn med passkey" → system-UI viser registrerte passkeys → velg → logget inn.
3. Trykk knappen og kanseller → ingen toast.
4. Hvis serverfeil oppstår → konsoll viser detaljert feil, toast viser konkret melding (ikke "ikke konfigurert").
5. Desktop Chrome: oppførsel uendret (knappen virker, ingen autofill-prompt).

## Tekniske notater

- Vi kan re-introdusere ekte Conditional UI i en senere iterasjon med riktig lavnivå-flyt (`passkey.startAuthentication` → `navigator.credentials.get({mediation:"conditional"})` → `passkey.verifyAuthentication`). Krever litt mer kode og bør verifiseres på flere plattformer før utrulling.
- `localStorage`-flagg endres ikke; knappen er fortsatt alltid synlig.
