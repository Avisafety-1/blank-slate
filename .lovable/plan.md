# Fix: feilmeldinger fra `process-dronelog` blir aldri lest

## Problem
`supabase.functions.invoke()` setter `data = null` når edge-funksjonen returnerer non-2xx (401/403/429/5xx). Responsen ligger på `error.context` (en `Response`). I `callDronelogAction` (`src/components/UploadDroneLogDialog.tsx` ~L173) leses `upstreamStatus`/`reason`/`retryAfter`/`remaining` fra `data` — som alltid er `null` ved feil. Dermed faller alle DJI-feil i `getDjiLoginErrorMessage` til "ukjent feil", og brukeren ser bare den generiske "Edge Function returned a non-2xx status code".

## Endring (kun frontend)
`callDronelogAction` skrives om til å lese feilbody fra `error.context`:

```ts
if (error) {
  let body: any = null;
  try {
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      body = await ctx.clone().json().catch(() => null);
    }
  } catch { /* ignore */ }
  body = body ?? (data as any) ?? {};
  const err: any = new Error(body.error || error.message || 'Request failed');
  err.upstreamStatus = body.upstreamStatus ?? (error as any)?.context?.status ?? 0;
  err.retryAfter = body.retryAfter;
  err.remaining = body.remaining;
  err.reason = body.reason;
  err.details = body.details;
  throw err;
}
```

Slik at både `upstreamStatus` og `reason` fra edge-funksjonen kommer riktig ut. `getDjiLoginErrorMessage` fungerer da som tiltenkt:
- 429 → "For mange innloggingsforsøk mot DJI. Vent X sekunder…"
- 401 + `reason=invalid_credentials` → "Feil DJI-e-post eller passord…"
- 401 + `reason=api_key_invalid` → "DroneLog API-nøkkelen mangler…"

## Sekundær fallback
Hvis serveren skulle sende 401 uten `reason` (gammel cache/edge cold start), legges en fallback i `getDjiLoginErrorMessage`: når `reason` mangler og `upstreamStatus === 401` → vis "Feil DJI-e-post eller passord". `upstreamStatus === 429` uten reason → behandle som rate-limit.

## Filer
- `src/components/UploadDroneLogDialog.tsx` — `callDronelogAction` + fallback i `getDjiLoginErrorMessage`.

## Verifisering
- 429 fra DJI-login (allerede reprodusert i edge-loggene) skal nå vise gul rate-limit-toast med nedtelling, ikke generisk feil.
- Test med feil DJI-passord → rød "Feil DJI-e-post eller passord".
