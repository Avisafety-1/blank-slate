

## Fiks FlightHub 2 med korrekte base URL-er

### Funn
DJI-dokumentasjonen (doc-6282018) oppgir de faktiske OpenAPI-endepunktene:
- Kina: `https://es-flight-api-cn.djigate.com`
- Internasjonalt (Europa/US): `https://es-flight-api-us.djigate.com`

De URL-ene vi har brukt (`fh.dji.com`, `fh2-api.dji.com`) er enten webappen eller ikke-eksisterende domener.

### Endringer

**1. Edge function (`supabase/functions/flighthub2-proxy/index.ts`)**
- I `test-connection`: les respons som tekst forst, sjekk content-type, og parse JSON bare hvis det er JSON
- Vis bedre diagnostikk ved HTML-respons ("URL-en returnerer HTML, ikke API-JSON")

**2. Admin UI (`src/components/admin/ChildCompaniesSection.tsx`)**
- Oppdater dropdown-valgene til de korrekte endepunktene:
  - `https://es-flight-api-us.djigate.com` (Public Cloud - Internasjonal)
  - `https://es-flight-api-cn.djigate.com` (Public Cloud - Kina)
  - Egendefinert URL (for on-prem)
- Fjern de gamle feilaktige URL-ene (`fh.dji.com`, `fh2-api.dji.com`)

### Teknisk detalj
Alle API-kall bruker stier som `/openapi/v0.1/system_status`, `/openapi/v0.1/project`, osv. mot disse hostene. Headerne (`X-User-Token`, `X-Request-Id`, `X-Language`) forblir uendret.

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- robust JSON-parsing i test-connection
2. `src/components/admin/ChildCompaniesSection.tsx` -- korrekte base URL-valg

