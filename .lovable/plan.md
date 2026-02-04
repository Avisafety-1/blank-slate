

# Plan: Bytt til SafeSky Sandbox API med enkel autentisering

## Problem
Edge function bruker feil API-endepunkt og autentiseringsmetode:
- **Nåværende**: `https://public-api.safesky.app` med HMAC-signering
- **Korrekt**: `https://sandbox-public-api.safesky.app` med `x-api-key` header

## Løsning
Forenkle edge function ved å:
1. Endre URL til sandbox-endepunktet
2. Fjerne all HMAC-kode (100+ linjer)
3. Bruke enkel `x-api-key` header som vist i e-posten

## Endringer i `supabase/functions/safesky-beacons-fetch/index.ts`

### Før (kompleks HMAC)
```typescript
const SAFESKY_HOST = "public-api.safesky.app";
// ... 100+ linjer HMAC-kode ...
const authHeaders = await generateAuthHeaders(...);
```

### Etter (enkel x-api-key)
```typescript
const SAFESKY_HOST = "sandbox-public-api.safesky.app";
// Ingen HMAC-kode nødvendig

const response = await fetch(SAFESKY_BEACONS_URL, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': SAFESKY_BEACONS_API_KEY
  }
});
```

## Teknisk oppsummering

| Aspekt | Før | Etter |
|--------|-----|-------|
| Host | `public-api.safesky.app` | `sandbox-public-api.safesky.app` |
| Auth | HMAC-SHA256 (4 headers) | `x-api-key` header |
| Kode | ~180 linjer | ~100 linjer |
| Kompleksitet | Høy | Lav |

## Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/safesky-beacons-fetch/index.ts` | Bytt til sandbox URL, fjern HMAC, bruk x-api-key |

## Eksisterende secret
API-nøkkelen `SAFESKY_BEACONS_API_KEY` som allerede er konfigurert vil fortsatt brukes - bare URL og header-format endres.

## Forventet resultat
Etter endringen vil edge function kalle SafeSky sandbox-API med korrekt autentisering, og lufttrafikk vil vises på kartet.

