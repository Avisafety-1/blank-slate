## Skjul Turnstile-widgeten visuelt — behold verifisering i bakgrunnen

Cloudflare Turnstile støtter en "usynlig" modus der widgeten kjører og produserer token uten å vise checkbox/badge, så lenge brukeren ikke trenger en interaktiv challenge.

### Endring

**Fil:** `src/components/auth/TurnstileWidget.tsx`

1. Endre `appearance: "always"` → `appearance: "interaction-only"` i `window.turnstile.render(...)`-kallet.
   - "interaction-only" betyr: widget er skjult som standard, vises kun hvis Cloudflare faktisk krever en interaktiv challenge (sjelden — kun ved mistenkelig trafikk). Token genereres normalt i bakgrunnen via `callback`.
2. Behold container-`<div>`-en (Turnstile trenger et DOM-feste selv i usynlig modus), men gi den `className="hidden"` som default, og fjern `hidden` dynamisk hvis en interaktiv challenge dukker opp.
   - Enkleste variant: la `className` fra parent stå, men sett container-stil til `style={{ minHeight: 0 }}` — Turnstile injiserer ingen synlig iframe i interaction-only-modus, så den tar 0px plass naturlig. Ingen ekstra logikk trengs.

### Det vi IKKE rører

- `Auth.tsx` og innloggingsflyten: token sendes fortsatt med `signInWithPassword({ options: { captchaToken } })` som før.
- DJI-skip-logikken (`shouldSkipCaptcha`) — uendret.
- Test-key vs. prod-key-logikken — uendret.
- Backend/Supabase captcha-validering — uendret.

### Risiko

Veldig lav. Hvis Cloudflare bestemmer at en bruker må gjøre en interaktiv challenge, vil widgeten automatisk bli synlig (det er hele poenget med "interaction-only"). Da ser brukeren en checkbox akkurat der `<div>`-en står i Auth.tsx, så plasseringen i layouten bør forbli fornuftig.

### Verifisering etter endring

- Last `/auth` — ingen synlig Turnstile-boks.
- Logg inn med korrekt passord — skal fungere som før (sjekk Network: `cf-turnstile-response` token sendes med).
- Konsoll: `[Turnstile] Token generated` skal fortsatt logges.
