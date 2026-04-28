## Kort svar

### Hvilke filer må endres?

For å fikse dette riktig må jeg sannsynligvis endre disse filene:

1. `src/pages/Hendelser.tsx`
   - Dette er hovedfeilen: innsending/utkast/oppdatering/sletting/open-url bruker i dag `ECCAIRS_ENV` fra `.env`/build config.
   - I denne koden er `VITE_ECCAIRS_ENV="sandbox"`, så rapporthandlingene sender `environment: "sandbox"` uansett hva du har valgt i innstillingsdialogen.

2. `src/components/eccairs/EccairsAttachmentUpload.tsx`
   - Vedlegg er også hardkodet til sandbox:
     ```ts
     formData.append("environment", "sandbox");
     ```
   - Den må få aktivt miljø fra `/hendelser`.

3. `src/components/eccairs/EccairsSettingsDialog.tsx`
   - Ikke nødvendigvis for lagring av credentials, for den delen ser riktig ut.
   - Men den bør kobles mot aktivt valgt miljø, slik at dropdown-valget faktisk styrer rapportflyten og ikke bare hvilken credential-rad man redigerer/tester.

Muligens ingen databaseendring trengs.

## Lagres sandbox og prod forskjellig?

Ja. Credentials lagres per selskap og per miljø.

Tabellen `eccairs_integrations` har unik nøkkel på:

```text
company_id + environment
```

Det betyr at disse er separate rader:

```text
company_id = Avisafe, environment = sandbox
company_id = Avisafe, environment = prod
```

De skal altså ikke være felles, og de skal ikke overskrive hverandre så lenge `environment` sendes riktig ved lagring.

Når du velger `Sandbox (test)` i dropdownen og lagrer, oppdateres sandbox-raden.
Når du velger `Produksjon` og lagrer, oppdateres prod-raden.

Passordet lagres kryptert i feltet:

```text
e2_client_secret_encrypted
```

Og funksjonen `update_eccairs_credentials` bruker `ON CONFLICT (company_id, environment)`, så den oppdaterer kun raden for valgt miljø.

## Blir brukernavn/passord overskrevet i Supabase?

Ikke mellom sandbox og prod, nei.

Det som kan overskrives er samme miljø for samme selskap:

```text
Avisafe + sandbox -> overskriver tidligere sandbox-credentials
Avisafe + prod    -> overskriver tidligere prod-credentials
```

Men:

```text
Avisafe + sandbox overskriver ikke Avisafe + prod
Avisafe + prod overskriver ikke Avisafe + sandbox
```

Det ser korrekt ut i databasefunksjonen.

## Henter fly.io appen credentials fra Supabase/AviSafe eller fra env i fly.io?

Basert på frontend-koden og databasefunksjonene ser designet slik ut:

```text
AviSafe frontend sender:
incident_id + environment

Fly.io gateway mottar:
environment = sandbox/prod

Gateway henter credentials for:
company_id + environment

Supabase RPC dekrypterer:
e2_client_id + e2_client_secret
```

Det finnes også en indikator i `EccairsSettingsDialog` som viser om testtilkobling bruker:

```text
credentials_source === "database"
```

Det tyder på at fly.io-gatewayen kan ha fallback til globale env-credentials, men at den foretrukne/forventede kilden er database-credentials per selskap når de finnes.

Det viktigste i feilen din er derfor: frontend sender fortsatt `sandbox`, og da ber gatewayen om sandbox-credentials. Produksjonscredentials blir da ikke brukt, selv om de er lagret og testet OK.

## Hva som skal endres

1. Fjerne låsingen mot `VITE_ECCAIRS_ENV` i `Hendelser.tsx`.
2. Innføre aktivt ECCAIRS-miljø på `/hendelser`, for eksempel `eccairsEnvironment`.
3. Bruke `eccairsEnvironment` i alle ECCAIRS-kall:
   - opprett utkast
   - oppdater utkast
   - slett utkast
   - send inn
   - åpne i ECCAIRS
   - hente status fra `eccairs_exports`
   - realtime-filter for `eccairs_exports`
4. Koble `EccairsAttachmentUpload` til samme miljø, så vedlegg ikke alltid går til sandbox.
5. Koble dropdownen i `EccairsSettingsDialog` tilbake til aktivt miljø i `/hendelser`, slik at valgt Produksjon/Test faktisk styrer hvor rapporten sendes.
6. Legge inn tydelig visning/logging av aktivt miljø, slik at du ser om en innsending faktisk bruker `prod`.

## Forventet resultat

Etter endringen blir flyten:

```text
Du velger Produksjon på /hendelser
        ↓
AviSafe sender environment: "prod"
        ↓
Fly.io gateway henter prod-credentials fra Supabase for Avisafe
        ↓
Rapporten sendes til ECCAIRS produksjon
```

Og for test:

```text
Du velger Sandbox/test på /hendelser
        ↓
AviSafe sender environment: "sandbox"
        ↓
Fly.io gateway henter sandbox-credentials fra Supabase for Avisafe
        ↓
Rapporten sendes til ECCAIRS UAT/test
```