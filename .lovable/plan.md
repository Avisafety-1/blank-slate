
# Plan: Cloudflare Turnstile på innlogging (kun frontend, fase 1)

## Mål
Generere `captchaToken` på login og sende det med til Supabase, **uten** å aktivere håndhevelse i Supabase Dashboard ennå. Dette gjør at vi kan måle suksessrate i produksjon før vi skrur på beskyttelsen, og garantert ingen brukere låses ute i denne fasen.

## Hva som endres

### 1. Turnstile-konto og nøkler (du gjør dette manuelt)
- Opprett gratis konto på dash.cloudflare.com → Turnstile
- Lag en widget for domenene: `login.avisafe.no`, `app.avisafe.no`, `*.lovable.app`
- Velg "Managed" mode (usynlig hvis mulig, ellers checkbox)
- Du får en **Site Key** (offentlig, OK i kode) og en **Secret Key** (kun edge function)

### 2. Frontend-endringer

**Ny fil: `src/components/auth/TurnstileWidget.tsx`**
- Lazy-loader Turnstile-script (`https://challenges.cloudflare.com/turnstile/v0/api.js`)
- React-wrapper rundt widget med `onVerify(token)` callback
- Auto-reset etter feil/expiry
- Skip-rendering hvis user-agent matcher DJI RC Plus (se under)

**Ny fil: `src/lib/deviceDetection.ts`**
- `isDjiController()`: sjekker `navigator.userAgent` for "DJI", "RC Plus", eller Chromium 70-signatur
- `shouldSkipCaptcha()`: returnerer true for DJI eller hvis Turnstile feiler å laste

**Endre `src/pages/Auth.tsx`**
- Importer TurnstileWidget
- Hold `captchaToken` i state
- Render widget under login-skjema (skjul for DJI)
- Send `options: { captchaToken }` til `signInWithPassword` — fungerer selv om Supabase ikke håndhever det
- Disable login-knapp til token finnes (unntatt på DJI)
- Reset widget etter feilet login

### 3. Site Key i miljøvariabler
- Site key er offentlig — legges som vanlig konstant i koden eller `VITE_TURNSTILE_SITE_KEY` i `.env`
- Secret key trengs **ikke** i denne fasen (Supabase håndhever ikke ennå). Lagres når vi går til Fase 2.

### 4. Telemetri (valgfritt men anbefalt)
Logg til console (eller en enkel tabell senere) når:
- Widget feilet å laste
- DJI-bypass ble brukt
- Token ble generert
Dette gir oss data før vi aktiverer håndhevelse.

## Hva som IKKE endres
- Ingen Supabase Dashboard-konfigurasjon (du gjør det manuelt i Fase 3 senere)
- Ingen edge functions (Supabase håndterer Turnstile-verifisering internt når aktivert)
- Ingen database-migrasjoner
- Ingen passkey-, MFA-, eller rate-limiting-endringer

## DJI bypass-detalj
```ts
// Eksempel
const ua = navigator.userAgent.toLowerCase();
const isDji = /dji|rc plus|smart controller/i.test(ua) 
  || (ua.includes('chrome/70') && ua.includes('linux'));
```
DJI får aldri se widget og sender ingen token. Når vi senere aktiverer håndhevelse i Supabase, må vi enten:
- Bygge en edge function som logger inn DJI-brukere uten captcha (med ekstra sjekk)
- Eller la Supabase-håndhevelse stå av for hele appen og bare bruke widget som "soft signal"

Dette avklarer vi i Fase 3-planen.

## Risiko i denne fasen
| Risiko | Konsekvens | Mitigering |
|---|---|---|
| Widget laster ikke (nett/CSP) | Bruker ser knapp som ikke aktiveres | Timeout 5s → fallback "skip" + console-log |
| Turnstile blokkerer legit bruker | Ingen — Supabase håndhever ikke | n/a |
| Bryter eksisterende login | Høy hvis feil i kode | Hold endring isolert i Auth.tsx, ingen endring i AuthContext |
| Øker bundle-størrelse | Marginalt — script lastes lazy fra CF CDN | OK |

## Etter denne planen
Når du har kjørt Fase 1 i ~1 uke og bekreftet at >99% av login-forsøk får token, lager vi Fase 2-plan: lagre Turnstile secret key i Supabase Dashboard og aktivere håndhevelse, samt bygge DJI-bypass-edge-function.

## Filer som endres
- `src/components/auth/TurnstileWidget.tsx` (ny)
- `src/lib/deviceDetection.ts` (ny)
- `src/pages/Auth.tsx` (endring)
- `.env` (legg til `VITE_TURNSTILE_SITE_KEY` — du oppgir verdi etter Cloudflare-oppsett)

## Hva jeg trenger fra deg før implementering
**Turnstile Site Key** fra Cloudflare. Du trenger ikke gi meg Secret Key i denne fasen.
