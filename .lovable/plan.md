

## Legg til EU-region for DJI FlightHub 2

### Rotårsak

Vi har kun prøvd `es-flight-api-us.djigate.com` og `es-flight-api-cn.djigate.com`. DJI har en dedikert EU-server: `https://es-flight-api-eu.djigate.com`. Norske brukere vil mest sannsynlig ha tokenet registrert på EU-serveren, noe som forklarer alle 401-feilene.

### Endringer

**1. Edge function (`flighthub2-proxy/index.ts`)**
- Legg til `https://es-flight-api-eu.djigate.com` i `REGION_URLS`-arrayen for automatisk region-fallback

**2. Admin UI (`ChildCompaniesSection.tsx`)**
- Legg til EU som valg i base URL dropdown: `"Public Cloud – Europa (EU)"`
- Sett EU som **standard/første valg** siden målgruppen er norsk
- Oppdater URL-sjekken som bestemmer om custom input skal vises

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- legg til EU i region-fallback
2. `src/components/admin/ChildCompaniesSection.tsx` -- legg til EU i dropdown

