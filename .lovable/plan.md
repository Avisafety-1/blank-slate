

## Plan: Test DJI HMS-endepunkt med kjent SN og fiks list-devices

### Hva vi vet
- **Loggene viser at `list-devices` aldri har blitt kalt** - kun `list-projects` og `upload-route` finnes i loggene
- Token og base URL fungerer (upload-route og list-projects virker med `openapi-v0.1`)
- Org UUID er `4593f426-e454-4ba5-8246-92b109bb0a12`
- Kjent drone SN: `1581F8DBW255D00A2M0U`
- Du er på auth-siden i preview, så jeg kan ikke teste via curl akkurat nå

### Mulig årsak til at list-devices aldri kalles
Siden loggene er helt tomme for `list-devices`, kan det hende at:
1. Edge-funksjonen krasjer på body-parsing før den når `list-devices`-logikken
2. Eller at UI-et ikke sender kallet riktig etter redeployen

### Plan

**1. Legge til en ny debug-action `test-device-api`**

En enkel action i `flighthub2-proxy` som tester tre DJI-endepunkter på én gang og returnerer rå-resultatene:
- `GET /openapi/v0.1/device` (org-enheter)
- `GET /openapi/v0.1/device/hms?device_sn_list=1581F8DBW255D00A2M0U` (HMS)
- `GET /openapi/v0.1/device/1581F8DBW255D00A2M0U/state` (enhetsstatus)

Returnerer rå HTTP-status + body for alle tre, uten noen normalisering.

**2. Legge til en "Test enhets-API" knapp i `FH2DevicesSection.tsx`**

En ny knapp ved siden av "Hent enheter" som kaller `test-device-api` og viser rå-responsen direkte. Ingen parsing, ingen normalisering - bare rå JSON fra DJI.

**3. Redeploy og test**

Etter deploy: trykk "Test enhets-API", og vi får svart-hvitt svar på:
- Om `/device` returnerer tom liste eller data
- Om HMS virker med den kjente SN-en
- Om device state virker

### Teknisk
- Filer: `supabase/functions/flighthub2-proxy/index.ts`, `src/components/admin/FH2DevicesSection.tsx`
- Ingen databaseendringer
- Debug-actionen kan fjernes etterpå

### Forventet resultat
Vi ser nøyaktig hva DJI returnerer for hvert endepunkt og kan endelig avgjøre om det er rettighets- eller mappingproblem.

