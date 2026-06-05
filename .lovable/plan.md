## Bakgrunn

DJI FlightHub 2 kalte `-feed/v1/uav` to ganger etter forrige deploy (se `fh2_airspace_feed_log` id 2 og 3). Authorization-headeren er:

```
SS-HMAC Credential=…, SignedHeaders=…, Signature=…
```

Dette er FH2 sin AWS-SigV4-lignende HMAC-protokoll, ikke en plain Bearer-token. Dagens `extractKey()` ser kun etter `Bearer`, `x-api-key`, `apikey` og query-parametre — derfor 401. Det er ingen feil med deploy eller URL; bare auth-parsing som mangler.

`-webhook` ga 200 på `/v1/uav` fordi den funksjonen har en åpen fallback — det er ikke en ekte verifisering og må ikke brukes som feed-endepunkt i FH2.

## Mål

Få Verify mot `https://pmucsvrypogtttrajqxq.functions.supabase.co/flighthub2-airspace-feed` til å returnere 200 med en gyldig (men foreløpig tom) trafikkfeed, slik at Tensio kan ferdigstille koblingen og vi etterpå kan bygge SafeSky/BarentsWatch → DJI mapping.

## Trinn

### 1. Diagnose-trinn (én ekstra Verify)

Midlertidig logge **full** Authorization-header (i stedet for masket) til `fh2_airspace_feed_log` slik at vi ser nøyaktig hva DJI sender:

```
SS-HMAC Credential=<keyId>/<date>/<region>/<service>/ss_request,
        SignedHeaders=host;x-ss-date;…,
        Signature=<hex>
```

Be Tensio trykke Verify én gang til, lese ut én rad, og deretter re-maskere headeren igjen.

### 2. Parse SS-HMAC

Implementere parser i `flighthub2-airspace-feed/index.ts`:

- Plukk ut `Credential`, `SignedHeaders`, `Signature` fra Authorization-headeren.
- Første del av `Credential` (før første `/`) er **keyId** — det er den nøkkelen Tensio limte inn i FH2.
- Bruk `lookup_fh2_feed_company` med keyId for å finne `company_id` og hente lagret secret.

### 3. Verifiser HMAC

Bygg canonical request etter samme oppskrift som AWS SigV4 (eller DJI sin variant — bekreftes via headere fra trinn 1):

```
method \n
canonical_path \n
canonical_query \n
canonical_headers \n
signed_headers \n
hashed_payload
```

Signer med stored secret, sammenlign konstant-tid mot `Signature`. Match → `matched_key = true`, status 200.

### 4. Returner tom feed på riktig format

Beholde dagens svar:

```json
{ "code": 0, "message": "success", "data": [] }
```

Hvis FH2 forventer noe annet (vises i feilmelding etter Verify), justeres svaret.

### 5. Etter Verify = grønn

Bytte ut tom `data: []` med faktisk mapping fra SafeSky-beacons + BarentsWatch ADS-B innenfor `lat/lng/radius` fra query — dette gjør vi i en oppfølgende loop.

## Teknisk

- Fil: `supabase/functions/flighthub2-airspace-feed/index.ts`
- Hjelpemigrasjon (kun hvis nødvendig): utvide `lookup_fh2_feed_company` til å returnere både `company_id` og dekryptert secret i én call, eller legge til ny RPC `get_fh2_feed_secret(p_key_id)` (SECURITY DEFINER, dekrypterer via `pgp_sym_decrypt` med `FH2_ENCRYPTION_KEY`).
- HMAC: bruk Web Crypto (`crypto.subtle.importKey` + `sign("HMAC", …)`).
- Logging: behold full request-logging i `fh2_airspace_feed_log` (med masket Authorization etter trinn 1).
- Ingen frontend-endringer.

## Avhengighet

Trinn 2–4 krever én Verify-runde etter trinn 1 for å bekrefte eksakt canonical-request-format. Uten det blir HMAC-verifiseringen gjettverk.
