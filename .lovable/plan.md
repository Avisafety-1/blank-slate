# DJI-innlogging: felles rate-limit-pott

## Svar på spørsmålet

Ja — «for mange innloggingsforsøk» deles i praksis mellom brukere. Innloggingen skjer aldri direkte mot DJI fra brukerens enhet; alle innlogginger går gjennom DroneLog-endepunktet `/accounts/dji` fra våre edge functions, med én API-nøkkel per selskap (eller Avisafes fellesnøkkel).

Det som er bekreftet i koden og databasen:

- Fire kodeveier logger inn mot DroneLog: manuell opplasting/list (`process-dronelog`), enkeltbehandling av logg (`dji-process-single`), nattlig kø-bygging (`dji-sync-enqueue`) og `dji-sync-worker`.
- Alle bruker `companies.dronelog_api_key`, med fallback til den globale `DRONELOG_AVISAFE_KEY`.
- 75 selskaper i basen, 61 har nøkkel lagret — men bare 34 unike nøkler. Mange selskaper deler altså samme nøkkel, og 14 selskaper faller tilbake på fellesnøkkelen.
- Alle kall går ut fra Supabase sine edge-IP-er, så hvis DroneLog struper per IP (Laravel «Too Many Attempts» gjør typisk det), deles potten på tvers av alle selskaper uansett nøkkel. Dette siste er en hypotese vi ikke kan bekrefte uten svar fra DroneLog / `Retry-After`-headere.
- Hver eneste operasjon gjør en ny innlogging. Behandling av 5 logger = 5 innlogginger, selv om `dji_credentials.dji_account_id` allerede er lagret fra forrige gang.
- Nattlig `dji-sync-enqueue` logger inn på nytt for hver bruker i sveipet (nå opptil 50 brukere), noe som kan tømme potten rett før/etter at en bruker prøver manuelt.

Så: bruker A bruker faktisk opp forsøk for bruker B — først innenfor samme selskapsnøkkel, sannsynligvis også på tvers av selskaper.

## Foreslått fiks

Målet er å redusere antall innlogginger drastisk, ikke å øke grensen.

1. **Gjenbruk `dji_account_id` i stedet for å logge inn på nytt.**
   Når `dji_credentials.dji_account_id` allerede finnes, hopp over `/accounts/dji` og gå rett på `/logs/{accountId}`. Logg kun inn hvis account-id mangler eller list-kallet svarer 401/403.
   Gjelder `dji-process-single`, `dji-sync-enqueue`, `dji-sync-worker` og `process-dronelog` (action `dji-list-logs`, `process-log`).

2. **Felles innloggings-hjelper med backoff.**
   Én delt funksjon i `supabase/functions/_shared/dji-parser.ts` som:
   - forsøker uten innlogging når account-id finnes,
   - respekterer `Retry-After` ved 429,
   - returnerer en tydelig `rate_limited`-årsak videre.

3. **Kort «cooldown» per nøkkel.**
   Ved 429 lagres et tidsstempel (i minnet per instans + `app_config`-rad per nøkkel-fingeravtrykk) slik at nattlig sveip hopper over resten av brukerne på samme nøkkel i stedet for å brenne opp potten for manuelle brukere.

4. **Bedre feilmelding i UI.**
   Skille mellom «DJI/DroneLog struper oss akkurat nå (felles grense)» og «feil passord», slik at brukeren ikke tror det er hens egne forsøk som er brukt opp.

## Teknisk

- Filer: `supabase/functions/_shared/dji-parser.ts` (ny `resolveDjiAccount()`), `dji-process-single/index.ts`, `dji-sync-enqueue/index.ts`, `dji-sync-worker/index.ts`, `process-dronelog/index.ts`, samt feiltekster i `UploadDroneLogDialog.tsx` og `PendingDjiLogsSection.tsx` (i18n i både no.json og en.json).
- Ingen databaseendring nødvendig hvis cooldown legges i eksisterende `app_config`-tabell.
- Ingen endring i hvordan logger parses eller lagres.

## Verifisering

- Behandle 3 logger etter hverandre for samme bruker: kun én (eller null) innlogging i loggene.
- Kjør `dji-sync-enqueue` manuelt: antall `/accounts/dji`-kall skal falle kraftig sammenlignet med i dag.
- Bekreft at Elverum-brukerne kan behandle logger rett etter hverandre uten 429.
