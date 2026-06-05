## Problem

Verification feiler fordi:

1. **Encoding-mismatch:** FH2 sender `Signature` som **base64** (`UzfRoPecDk7BgCYuNxBUhUMQ44xUOYdjCfSrDvnrOfw=`, 44 tegn med padding = 32 bytes SHA-256). Edge-funksjonen vår genererer kandidatene i **hex** (64 tegn). De vil aldri matche, uansett om secret eller string-to-sign er korrekt.
2. **Secret-tolkning ukjent:** Vi vet ikke om FH2 bruker API-nøkkelen som rå ASCII, base64-dekodet, eller hex-dekodet bytes.

Loggen viser at vår lagrede nøkkel (40 tegn, prefix `QjrMVl`) brukes mot FH2-keyId `yoyK4RAaP4ta1uTgDsrucg/v1`. FH2 bekrefter at det kun finnes ÉN nøkkel å lime inn, så denne nøkkelen ER HMAC-secret.

## Endringer

### `supabase/functions/flighthub2-airspace-feed/index.ts`

**1. Sammenlign både base64 og hex**
- I `verify()`-loopen: for hver kandidat, beregn både hex og base64 (med og uten padding) av HMAC-resultatet, og sammenlign mot `parts.signature` i begge formater.
- Behold constant-time compare.

**2. Prøv secret i flere former**
For hver aktiv `(company_id, secret)` fra `get_active_fh2_feed_secrets`, prøv HMAC med secret-bytene tolket som:
- (a) UTF-8/ASCII bytes av strengen (slik vi gjør nå)
- (b) base64-dekodet til bytes (hvis strengen er gyldig base64)
- (c) hex-dekodet til bytes (hvis strengen er gyldig hex)

Det gir 3 secret-varianter × 5 string-to-sign-varianter × 2 encodings = inntil 30 kandidater per request. Første match → 200.

**3. Bedre logging i `diagnostic`**
- Hvilken (secret-form, variant, encoding)-kombinasjon som matchet — eller alle som ble prøvd ved mismatch.
- Behold `tried_variants` men legg til `encoding` (`hex`/`base64`) og `secret_form` (`raw`/`base64`/`hex`) per kandidat.
- Aldri logg selve secret-en, kun prefix/lengde.

### Verifisering

Etter deploy: be brukeren trykke "Verify" i FH2 igjen. Tre mulige utfall:
- **200 success** → vi fant riktig kombinasjon. Lås da kombinasjonen i koden og fjern de andre forsøkene i en oppfølging.
- **Mismatch fortsatt** → loggen viser alle 30 kandidater. Da må vi enten få tilgang til FH2-dokumentasjonen for nøyaktig string-to-sign-spec, eller sammenligne med deres referanseimplementasjon.
- **Andre feil (timestamp, nonce, etc.)** → adresseres separat.

## Det jeg IKKE endrer nå

- Ingen DB-migrering (RPC `get_active_fh2_feed_secrets` står som den er).
- Ingen UI-endring (fortsatt ett felt for API-nøkkel — bekreftet riktig).
- Ingen endring i hvordan nøkkelen lagres/krypteres.
