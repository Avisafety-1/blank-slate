## Rotårsak

FH2 signerer HMAC mot URL-en de fikk: `https://pmucsvrypogtttrajqxq.functions.supabase.co/flighthub2-airspace-feed`.
Det betyr at i kanonisk request bruker FH2:
- `host: pmucsvrypogtttrajqxq.functions.supabase.co`

Men Supabase sin edge-proxy omskriver host-headeren før forespørselen når vår funksjon, så vi leser `host: edge-runtime.supabase.com` og putter feil host inn i kanonisk request. Det gir signaturen vår en helt annen hash enn FH2 sin.

## Endring

### `supabase/functions/flighthub2-airspace-feed/index.ts`

**1. Overstyr host-verdien i kanonisk request**

I `buildAllCandidates`, når vi bygger `canonicalHeaders`, erstatt verdien for header `host` med den offentlige hostnavnet FH2 ringte. Vi henter denne fra (i prioritert rekkefølge):
- `x-forwarded-host` header (hvis Supabase setter den)
- ellers den hardkodede public hostname `<SUPABASE_PROJECT_REF>.functions.supabase.co`, der `SUPABASE_PROJECT_REF` leses fra env-variabel (alt. utledet fra `SUPABASE_URL`).

Andre signed headers (`x-ss-date`, `x-ss-nonce`) er allerede uendret av Supabase.

**2. Behold de 30 kandidatene (raw/base64/hex × 5 varianter × hex/base64/base64nopad)**

Når host nå er korrekt, vil én av variantene matche hvis secret-tolkningen er riktig.

**3. Logging**

Legg til `canonical_host_used` i diagnostic så vi ser hvilken host vi signerte mot ved evt. ny mismatch.

### Verifisering

Trykk Verify i FH2 igjen. Forventer 200. Hvis fortsatt mismatch:
- Logg vil vise hvilken host vi brukte og de første 24 tegnene av kandidat-signaturene
- Vi vet da om host er problemet eller om secret-format / string-to-sign-variant fortsatt er feil

## Det jeg IKKE endrer

- Ingen DB-migrering
- Ingen UI-endring
- Ingen endring i path-håndtering (path er allerede riktig)
