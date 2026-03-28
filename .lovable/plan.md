

## Fix: "Failed to fetch" på mobil ved flylogg-opplasting

### Analyse

Feilen skjer kun på mobil (ikke iPad), kommer umiddelbart, og rammer begge loggtyper. Tre problemer identifisert:

### Problem 1: `process-ardupilot` krasjer ved auth
Linje 31 bruker `supabase.auth.getClaims(token)` som **ikke finnes** i supabase-js@2. Dette gir runtime-krasj (500) ved enhver POST-request til ArduPilot-endpointet.

### Problem 2: Mobil-spesifikk "Failed to fetch"
"Failed to fetch" betyr at requesten aldri når serveren. På mobil (men ikke iPad) kan dette skyldes:
- PWA standalone-modus har strengere nettverkshåndtering
- Filen leses inn i minnet som FormData, men mobil har mer begrenset minne
- Ingen retry-logikk for nettverksfeil

### Problem 3: Ingen feilkategorisering
Catch-blokken i `handleUpload` viser bare `error.message` uten å skille mellom nettverksfeil, auth-feil og serverfeil. Det gjør det umulig å vite hva som feiler.

### Endringer

**1. `supabase/functions/process-ardupilot/index.ts` — Fix auth**
```typescript
// Linje 30-37: Bytt getClaims til getUser (samme som process-dronelog)
const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
if (authError || !authUser) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
```

**2. `src/components/UploadDroneLogDialog.tsx` — Robust upload med retry**
I `handleUpload` (linje 617-661):
- Wrap fetch i try/catch som skiller `TypeError` (nettverksfeil / "Failed to fetch") fra HTTP-feil
- Ved nettverksfeil: automatisk retry 1 gang etter 1 sekund
- Vis spesifikk feilmelding: "Nettverksfeil — sjekk internettforbindelsen og prøv igjen" i stedet for generisk "Failed to fetch"
- Samme fix i `handleBulkUpload`

**3. Forbedret feillogging i catch**
Legg til `console.error` med feiltype (network/auth/server) så vi kan diagnostisere videre om feilen vedvarer.

### Filer som endres
| Fil | Endring |
|-----|---------|
| `supabase/functions/process-ardupilot/index.ts` | `getClaims` → `getUser()` |
| `src/components/UploadDroneLogDialog.tsx` | Retry-logikk + bedre feilmeldinger for nettverksfeil |

### Forventet resultat
- ArduPilot-opplasting slutter å krasje på auth
- Nettverksfeil på mobil får automatisk retry
- Brukeren ser konkret feilmelding i stedet for "Failed to fetch"

