

## Mål
Selskap skal kunne overstyre auto-generert SafeSky callsign med eget format: **prefix (callsign)** + **variabel-modus** (counter `01,02,03…` ELLER drone-registreringsnummer fra dronekortet). En toggle bestemmer om innstillingen propageres til underavdelinger.

## Database
Migrasjon — legg til 3 kolonner på `companies`:
- `safesky_callsign_prefix text` — eget prefix (f.eks. `nordavind`). NULL = bruk dagens auto-logikk (selskapsnavn).
- `safesky_callsign_variable text default 'counter'` — `'counter'` eller `'drone_registration'`.
- `safesky_callsign_propagate boolean default false` — propager til barn.

Utvid `propagate_company_settings()` trigger: når toggle er `true` og en av callsign-feltene endres, kopier `safesky_callsign_prefix` + `safesky_callsign_variable` til alle barn.

## Edge functions — `safesky-advisory` + `safesky-cron-refresh`
Erstatt callsign-logikken (linjer ~417-464 i advisory, ~261-287 i cron):

```ts
// Hent prefix fra eget selskap, ev. fall tilbake til parent hvis null
let prefix = company?.safesky_callsign_prefix;
let variable = company?.safesky_callsign_variable || 'counter';
if (!prefix && company?.parent_company_id) {
  // bruk parent (også konsistent for hierarki-counter)
}
const sanitized = (prefix || companyName).toLowerCase().replace(/[^a-z0-9]/g, '');

let suffix: string;
if (variable === 'drone_registration') {
  // hent drone fra mission → drones.registration_number/serienummer
  const { data: drone } = await supabase.from('drones')
    .select('registration_number').eq('id', mission.drone_id).single();
  suffix = (drone?.registration_number || '01').replace(/[^a-z0-9]/gi, '');
} else {
  // counter — eksisterende logikk basert på active_flights index
  suffix = String(index).padStart(2, '0');
}
callSign = sanitized + suffix;
```

Sjekke faktisk dronekort-kolonnenavn i `drones` (registreringsnummer) før implementasjon.

## UI — `src/components/admin/CompanyManagementSection.tsx`
Ny ekspanderbar seksjon **«SafeSky callsign»** under selskapsinnstillinger:
- `Input` — Callsign-prefix (placeholder: «f.eks. nordavind»; tomt = bruk selskapsnavn)
- `RadioGroup` / `Select` — Variabel: `Teller (01, 02, 03…)` | `Drone-registreringsnummer`
- `Switch` — «Gjelder for alle underavdelinger»
- Forhåndsvisning: `nordavind01` eller `nordavindLN-ABCD`
- Lagre-knapp som `update`-er `companies`-raden.

## Filer
- Ny migrasjon (3 kolonner + utvidet trigger)
- `supabase/functions/safesky-advisory/index.ts`
- `supabase/functions/safesky-cron-refresh/index.ts`
- `src/components/admin/CompanyManagementSection.tsx`

## Verifisering
- Sett prefix=`testop`, variabel=`counter` → start oppdrag → bekreft `testop01` publiseres.
- Bytt til `drone_registration` med drone som har reg.nr. `LN-ABCD` → bekreft `testopLNABCD`.
- Slå på propagate-toggle → bekreft at underavdelinger arver verdiene.
- Tomt prefix → fall tilbake til dagens auto-logikk (selskapsnavn).

