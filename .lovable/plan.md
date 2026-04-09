

## Fiks FlightHub 2 test-connection: returner 200 når token fungerer

### Rotårsak

Nettverksloggene beviser at DJI EU-serveren fungerer:
- `token_ok: true`, `project_count: 14`, `api_version: "openapi-v0.1"`
- Men `server_ok: false` fordi `system_status`-endepunktet enten ikke finnes eller returnerer et annet format på EU

Proxy-koden på linje 387 returnerer `status: result.server_ok ? 200 : 502`. Siden `server_ok` er `false`, returnerer den HTTP 502. `supabase.functions.invoke` kaster da en "non-2xx" feil og klienten treffer `catch`-blokken i stedet for å lese `data`.

### Løsning

**Edge function (`flighthub2-proxy/index.ts`)** -- linje 387:
- Endre til: `status: (result.server_ok || result.token_ok) ? 200 : 502`
- Hvis token_ok er true (vi fikk prosjektdata fra DJI), er tilkoblingen vellykket uansett hva system_status sier

**Admin UI (`ChildCompaniesSection.tsx`)** -- linje 506-507:
- Oppdater suksess-sjekken: Vis suksess også når `token_ok` er true selv om `server_ok` er false
- Vis antall prosjekter funnet i suksessmeldingen: "FlightHub 2 tilkoblet! {project_count} prosjekter funnet."

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- endre HTTP status-logikk (1 linje)
2. `src/components/admin/ChildCompaniesSection.tsx` -- oppdater suksess-logikk i UI

