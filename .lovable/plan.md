## Hvorfor matchet det ikke

`fh2_airspace_feed_config` har én aktiv rad med 40-tegns nøkkel (prefix `QjrMVl`). FH2 sender `Credential=NQBbJ8.../v1` — 22 tegn, helt urelatert til nøkkelen vi genererte. Konklusjon: DJI FH2 bruker IKKE den limte API-nøkkelen som Credential keyId. Den brukes (mest sannsynlig) kun som HMAC-secret, og FH2 finner på sin egen klient-ID i Credential.

Det betyr at oppslag via Credential aldri vil treffe vår lagrede nøkkel. Vi må verifisere annerledes.

## Plan

1. Bytt strategi i `flighthub2-airspace-feed`
   - Ikke slå opp company via `lookup_fh2_feed_company(credential)` lenger.
   - Hent alle aktive (company_id, secret) fra `fh2_airspace_feed_config` via ny SECURITY DEFINER-RPC som dekrypterer secret.
   - For hver secret: beregn de 5 signaturvariantene og sammenlign med `parts.signature`.
   - Første treff bestemmer `company_id` og gir `200 success`. Constant-time compare beholdes.

2. Ny RPC `get_active_fh2_feed_secrets(p_enc_key text)`
   - `RETURNS TABLE(company_id uuid, secret text)`.
   - `SECURITY DEFINER`, kun `GRANT EXECUTE` til `service_role`.
   - Itererer aktive rader, kjører `pgp_sym_decrypt`, hopper over rader som feiler.

3. Bedre logging
   - Ved mismatch: logg `tried_secrets_count`, signaturkandidater (ikke selve secret), credential-prefix og lengde.
   - Behold maskering av `Signature` i headers.

4. Deploy og verifiser
   - Trykk Verify i FH2 igjen.
   - Tre mulige utfall:
     - `200 success` → API-nøkkel-som-secret-modellen stemmer. Ferdig.
     - `signature_mismatch` med vår secret prøvd → secret stemmer ikke, vi har feil kanonisk format eller string-to-sign. Loggen viser presist hva vi prøvde.
     - Fortsatt mismatch på alle varianter → din SafeSky-hypotese styrkes: FH2 aksepterer trolig kun SafeSky-utstedte nøkler signert av SafeSky. Da må vi enten registrere oss som offisiell Airspace Data-leverandør hos DJI eller proxe gjennom SafeSkys API.

## Teknisk

- Antall aktive configs er typisk 1, maks få titalls. Lineær iterasjon er trygt på performance.
- Ingen endring i admin-UI eller `flighthub2-airspace-feed-config`.
- Ingen skjemaendringer utover ny RPC.