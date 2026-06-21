## Mål

Hopp over TOTP-2FA-utfordringen når brukeren logger inn med passkey. Behold 2FA-kravet for innlogging med e-post/passord (og Google OAuth) på samme konto.

## Sikkerhetsbegrunnelse

En passkey (WebAuthn) er allerede phishing-resistent, enhetsbundet og krever lokal brukerverifikasjon (biometri / PIN). Det regnes som sterk autentisering (NIST AAL2/AAL3), så å kreve TOTP i tillegg gir liten ekstra sikkerhet og mye friksjon. Passord alene er svakere og bør fortsatt kreve TOTP.

## Endringer

### 1. Ny hjelpefil — `src/lib/authMethod.ts`

```ts
import type { Session } from "@supabase/supabase-js";

type AmrEntry = { method: string; timestamp?: number };

function decodeJwtPayload(token: string): Record<string, any> | null {
  const base64Url = token.split(".")[1];
  if (!base64Url) return null;
  try {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getAmr(session: Session | null): AmrEntry[] {
  const token = session?.access_token;
  if (!token) return [];
  const payload = decodeJwtPayload(token);
  return Array.isArray(payload?.amr) ? payload.amr : [];
}

/**
 * Returnerer true hvis denne sesjonen ble autentisert med passkey/WebAuthn.
 * Vi sjekker hele amr-arrayen (ikke bare siste entry), fordi Supabase
 * ikke garanterer rekkefølge. En passkey-autentisering i sesjonens historikk
 * er tilstrekkelig bevis på sterk auth.
 */
export function isPasskeyLogin(session: Session | null): boolean {
  const amr = getAmr(session);
  return amr.some(
    (e) => e?.method === "passkey" || e?.method === "webauthn"
  );
}
```

**Endringer fra forrige utkast:**
- Bruker korrekt base64url-dekoding med padding (ikke `atob(token.split(".")[1])`), slik ChatGPT foreslo. Dette håndterer `-`, `_` og manglende `=`-padding.
- Funksjonen er trygg: den returnerer `null` ved ugyldig token i stedet for å kaste.

### 2. `src/components/MfaGate.tsx`

I `runCheck`: hent gjeldende sesjon, og hvis `isPasskeyLogin(session)` returnerer `true`, sett `needsMfa = false` og hopp over `getAuthenticatorAssuranceLevel`. Dette dekker første render etter login og senere reloads.

### 3. `src/pages/Auth.tsx`

- I `handlePasskeyLogin` etter vellykket login: hent ny sesjon, og hvis `isPasskeyLogin(session)` er `true`, redirect direkte uten AAL-sjekk eller `MfaChallengeDialog`.
- I redirect-`useEffect` og den andre AAL-sjekken: samme bypass.
- `handleLogin` (passord-flyten) — uendret. TOTP kreves fortsatt.

### 4. Google OAuth — uendret

`amr` vil inneholde `oauth`, ikke `passkey`, så TOTP kreves fortsatt for Google-innlogging på MFA-konti.

## Edge cases

- **Session refresh:** `amr` bevares i nytt access-token av Supabase, så bypass holder på tvers av reloads inntil utlogging.
- **Bruker uten TOTP:** Ingen effekt — `nextLevel` er allerede `aal1`.
- **Ugyldig/manglende token:** `getAmr` returnerer tom array → ingen bypass, fail-closed.
- **Passkey + TOTP i samme `amr`:** Passkey-metoden trigger bypass, fordi passkey allerede er sterk autentisering.
- **Fremtidig step-up:** Sensitive handlinger (slette konto, endre roller) kan fortsatt kreve lokal AAL2-prompt om nødvendig.

## QA

1. Bruker med TOTP + passkey: logg inn med biometri → rett inn, ingen TOTP-dialog.
2. Samme bruker: logg ut → logg inn med e-post/passord → TOTP-dialog vises.
3. Samme bruker: logg ut → logg inn med Google → TOTP-dialog vises.
4. Bruker uten TOTP: passkey-login som før.
5. Reload nettleser etter passkey-login: ingen TOTP-prompt fra `MfaGate`.
6. Sjekk konsoll: ingen feil fra JWT-dekoding ved passkey-login.
