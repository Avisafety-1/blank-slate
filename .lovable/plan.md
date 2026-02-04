

# Plan: Oppdatere SafeSky Edge Function til HMAC-autentisering

## Problem
SafeSky API har endret autentiseringsmetode fra enkel `x-api-key` header til **HMAC-SHA256 signatur-basert autentisering**. Den gamle metoden er deprecated og returnerer 401 Unauthorized.

## Løsning
Implementere SafeSky sin HMAC-autentisering i edge function `safesky-beacons-fetch` basert på deres offisielle Node.js SDK.

## Teknisk oversikt

HMAC-autentisering krever fire headere per forespørsel:

| Header | Beskrivelse |
|--------|-------------|
| `Authorization` | `SS-HMAC Credential=<kid>/v1, SignedHeaders=host;x-ss-date;x-ss-nonce, Signature=<hex-signatur>` |
| `X-SS-Date` | ISO8601 tidsstempel (f.eks. `2026-02-04T18:30:00Z`) |
| `X-SS-Nonce` | Unik UUID v4 per forespørsel |
| `X-SS-Alg` | `SS-HMAC-SHA256-V1` |

### Nøkkel-derivasjon (gjøres én gang fra API-nøkkelen)
1. **KID** = base64url(SHA256("kid:" + api_key)[0:16])
2. **HMAC-nøkkel** = HKDF-SHA256(api_key, salt="safesky-hmac-salt-v1", info="auth-v1", 32 bytes)

### Signatur-generering (per forespørsel)
1. Generer timestamp og nonce
2. Bygg "canonical request" streng med method, path, query, host, timestamp, nonce, body
3. Signer med HMAC-SHA256 og HMAC-nøkkelen

## Implementasjon

### 1. Oppdater `supabase/functions/safesky-beacons-fetch/index.ts`

Legge til HMAC-autentisering ved å:
- Implementere `deriveKid()` funksjon (SHA256 + base64url)
- Implementere `deriveHmacKey()` funksjon (HKDF-SHA256)
- Implementere `generateAuthHeaders()` funksjon
- Erstatte enkel `x-api-key` header med de fire HMAC-headerne

**Deno Web Crypto API** vil brukes for kryptografi (innebygd, ingen eksterne avhengigheter).

### 2. HMAC-implementasjonsdetaljer (Deno/Web Crypto)

```text
Canonical Request Format:
<HTTP-method>\n
<path>\n
<query-string>\n
host:<hostname>\n
x-ss-date:<timestamp>\n
x-ss-nonce:<uuid>\n
\n
<body-or-empty>
```

Signaturen beregnes som:
```
signature = HMAC-SHA256(hmac_key, canonical_request).hex()
```

## Filendringer

| Fil | Endring |
|-----|---------|
| `supabase/functions/safesky-beacons-fetch/index.ts` | Erstatte x-api-key med HMAC-auth |

## Eksisterende API-nøkkel
Nøkkelen `SAFESKY_BEACONS_API_KEY` du allerede har lagt til vil fortsatt brukes - bare autentiseringsmetoden endres.

## Forventet resultat
Etter oppdatering vil edge function sende korrekte HMAC-headere og få tilgang til SafeSky API. Flytrafikk vil vises på kartet.

