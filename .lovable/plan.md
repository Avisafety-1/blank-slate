## Problem
Cloudflare Turnstile feiler i Lovable preview fordi produksjons-site-key (`0x4AAAAAADnVAQnwtLDe3M3P`) krever at domenet er eksplisitt tillatt i Cloudflare. Preview-domener (`id-preview--...lovable.app`) endres per økt, og Cloudflare godtar ikke wildcard (`*.lovable.app`) på delte domener.

## Løsning
Modifiser `TurnstileWidget.tsx` til å automatisk bruke Cloudflares test-site-key (`1x00000000000000000000AA` — alltid passer) når appen kjører på:
- `localhost`
- ethvert domene som inneholder `lovable.app`

I produksjon (`login.avisafe.no`, `app.avisafe.no`) fortsetter widgeten å bruke `VITE_TURNSTILE_SITE_KEY`.

## Endringer
1. **src/components/auth/TurnstileWidget.tsx**:
   - Endre `SITE_KEY` fra en konstant til en funksjon/hjelper som sjekker `window.location.hostname`
   - Bruk test-key på `localhost` og `*.lovable.app`
   - Bruk `VITE_TURNSTILE_SITE_KEY` for alle andre domener
   - Logg til konsoll hvilken key som brukes (for debugging)

## Konsekvenser
- Preview fungerer umiddelbart uten Cloudflare-konfigurasjon
- Ingen endring i produksjonsoppførsel
- Test-key er trygg å eksponere (designet av Cloudflare for testing)