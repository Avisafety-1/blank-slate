

## Fiks ruteopplasting til FlightHub 2 med korrekt MinIO/OSS-signering

### Status
Tilkoblingen til FlightHub 2 fungerer. Neste steg er ruteopplasting. **Du trenger IKKE koble din egen Amazon S3-bøtte** -- DJI leverer sin egen lagringsbøtte via STS-tokener. Avisafe laster opp direkte til DJIs bøtte.

### Problem med nåværende kode
Opplastingskoden bruker `Authorization: OSS access_key_id:placeholder` -- en placeholder-signatur som aldri vil fungere. DJI-dokumentasjonen sier at man skal bruke **MinIO SDK** (S3-kompatibelt) med de midlertidige STS-credentials (`access_key_id`, `access_key_secret`, `security_token`) for å laste opp til DJIs Alibaba Cloud OSS-bøtte.

### Flyten (ifølge dokumentasjonen)
```text
1. GET /openapi/v0.1/project/sts-token  →  STS-credentials + endpoint + bucket + prefix
2. Upload KMZ til OSS/MinIO med korrekt AWS SigV4-signering (S3-kompatibelt)
3. POST /openapi/v0.1/wayline/finish-upload  →  meld fra til FH2 at filen er lastet opp
```

### Løsning

**Edge function (`flighthub2-proxy/index.ts`) -- upload-route action:**

1. Hent STS-token (allerede implementert, fungerer)
2. Erstatt placeholder-opplastingen med korrekt **AWS Signature V4**-signering:
   - Bruk `access_key_id` + `access_key_secret` fra STS-responsen
   - Inkluder `x-amz-security-token` (eller `x-oss-security-token`) headeren
   - Signer PUT-requesten manuelt med HMAC-SHA256 (implementert direkte i Deno uten ekstern SDK)
   - Endpoint fra STS-responsen (f.eks. `https://oss-cn-hangzhou.aliyuncs.com`) brukes som host
3. Etter vellykket opplasting: kall `finish-upload` (allerede implementert)

**Implementasjonsdetaljer:**
- Implementer en minimal AWS SigV4-signeringsfunksjon i edge-funksjonen (ca. 60 linjer)
- Funksjonen bruker Denos innebygde `crypto.subtle` for HMAC-SHA256
- Støtter OSS/MinIO som er S3-kompatibel
- Legg til bedre feillogging for å vise STS-respons og opplastingsresultat

**Annotasjoner (SORA-korridor):**
- `create-annotation` bruker allerede en direkte API-kall uten filopplasting -- denne bør fungere som den er

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- erstatt placeholder-signering med korrekt AWS SigV4

### Ingen databaseendringer eller nye secrets nødvendig
STS-tokener leveres av DJI API-et. Din S3-bøtte brukes ikke i denne flyten.

