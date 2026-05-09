## Runde 2B: Hardening av cron- og test-funksjoner

Mål: Lukke PT-8 #3 (`test-email`) og sikre 6 cron-/admin-funksjoner som i dag mangler autentisering eller skikkelig autorisasjon.

### Funksjoner som hardes

| # | Funksjon | Risiko i dag | Tiltak |
|---|----------|-------------|--------|
| 1 | `test-email` | Hvem som helst kan sende e-post via Resend (kvota-/spam-misbruk) | Krev Bearer JWT + superadmin-sjekk |
| 2 | `auto-complete-missions` | Åpen cron-endpoint, kan trigges av alle → masse-oppdatering av missions | Krev `x-cron-secret` ELLER service-role |
| 3 | `check-document-expiry` | Åpen, sender varsler på vegne av selskaper | Krev `x-cron-secret` ELLER service-role |
| 4 | `check-maintenance-expiry` | Samme som over | Krev `x-cron-secret` ELLER service-role |
| 5 | `operations-digest` | Åpen, kan generere/sende rapporter | Krev `x-cron-secret` ELLER service-role |
| 6 | `notam-sync` (hvis åpen) | Trigger ekstern API-fetch i loop | Krev `x-cron-secret` ELLER service-role |
| 7 | `cleanup-*` / andre cron-jobs (verifiseres) | Samme mønster | Krev `x-cron-secret` ELLER service-role |

### Auth-mønster (gjenbruk fra Runde 2A)

```ts
const cronSecret = req.headers.get('x-cron-secret');
const expected = Deno.env.get('CRON_SECRET');
const auth = req.headers.get('Authorization') ?? '';

const isCron = cronSecret && expected && cronSecret === expected;
const isServiceRole = auth.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '___none___');

if (!isCron && !isServiceRole) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
}
```

For `test-email`:
```ts
// Krev Bearer JWT, hent bruker, sjekk superadmin-rolle
const { data: { user } } = await supabase.auth.getUser(token);
const isSuper = await supabase.rpc('has_role', { _user_id: user.id, _role: 'superadmin' });
if (!user || !isSuper) return 403;
```

### Verifisering av cron-kallere

Sjekk `pg_cron`-jobber i databasen for å bekrefte at alle scheduled jobs allerede sender `x-cron-secret`-headeren. Hvis noen mangler, oppdater cron-jobben (via `supabase--read_query` for å inspisere, og migration for å fikse).

### Steg

1. Verifiser hvilke cron-funksjoner som er åpne og hvordan de blir kalt (les `pg_cron` schedules + funksjonskode).
2. Hard `test-email` med JWT + superadmin-sjekk.
3. Hard hver cron-funksjon med `x-cron-secret` ELLER service-role.
4. Oppdater eventuelle `pg_cron`-jobs som ikke allerede sender riktig header (krever migration).
5. Deploy alle endrede funksjoner.
6. Smoke-test: `curl` uten auth → 401, med riktig secret → 200.

### Akseptert risiko (ikke i denne runden)

- Public proxies (NOTAM/Weather/OpenAIP-proxy) — lav impact, kun public data, beholdes åpne.
- Webhooks som krever signatur-verifikasjon (Stripe, etc.) — bruker allerede signatur, ikke JWT.

### Estimert omfang

~7 edge functions + 0–3 migrations for `pg_cron`-oppdatering. Ingen frontend-endringer.
