

## Fiks FlightHub 2 autentisering -- JWT-diagnostikk

### Analyse

Fra dokumentasjonen (linje 191):
> "The current X-User-Token for FlightHub 2 is the **organization key** for FlightHub Sync. The path to obtain the organization key is: FlightHub 2 → My Organization → Organization Settings → FlightHub Sync → Organization Key."

Men fra skjermbildet ditt ser det ut som Organization Key er den **samme nøkkelen som vises under OpenAPI-seksjonen** ("Copy key"-knappen). Det finnes ikke en separat nøkkel under FlightHub Sync.

DJI sier at `X-User-Token` er en **JWT-token**. Vi kan dekode den for å se om:
- Den inneholder riktig organisasjon
- Den er utløpt
- Den faktisk er en JWT (og ikke en annen type nøkkel)

### Problem
Vi vet ikke om nøkkelen som sendes faktisk er en gyldig JWT, eller om den er feil formatert/utløpt. Vi trenger diagnostikk.

### Plan

**1. Edge function (`flighthub2-proxy/index.ts`)**
- I `test-connection`: Dekod JWT-tokenet (base64 uten signaturvalidering) og returner payload til frontend
- Vis: `org_id`, `sub` (bruker), `exp` (utløpstid), og om tokenet faktisk er en JWT
- Logg også nøyaktig hvilke headers som sendes til DJI (uten å vise selve tokenet, bare om det finnes og lengde)

**2. Admin UI (`ChildCompaniesSection.tsx`)**
- Etter test: vis JWT-info (organisasjon, bruker, utløpsdato) i testresultatet
- Vis tydelig feilmelding hvis tokenet IKKE er en JWT (feil nøkkeltype)
- Legg til hjelpetekst: "Nøkkelen finner du under OpenAPI → Copy key i FlightHub 2 Organization Settings"

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- JWT-dekoding i test-connection
2. `src/components/admin/ChildCompaniesSection.tsx` -- vis JWT-diagnostikk

