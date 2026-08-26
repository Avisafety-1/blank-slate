# Fiks førstegangsinnlogging med personlig DroneLog-nøkkel

## Bekreftede funn

- Forsøket for `hauggard@gmail.com` startet med selskapets DroneLog-nøkkel, som DroneLog avviste med `401`.
- Automatisk fallback brukte deretter den globale nøkkelen, som traff `429 Too Many Attempts` kl. 11:09:27 UTC.
- Brukeren har ingen rad i `dji_credentials`, ingen lagret DJI-konto og ingen personlig DroneLog-nøkkel.
- Dagens rekkefølge er årsaken: frontend kaller først `dji-login`; `dji-save-credentials` kjøres bare etter vellykket innlogging. Personlig nøkkel kan nå bare opprettes når `dji_credentials` allerede finnes, så en helt ny bruker kommer aldri til nøkkelopprettelsen når selskap/global nøkkel feiler først.
- En annen bruker har allerede fått opprettet og gjenbrukt en personlig nøkkel, så selve `POST /keys`, kryptering og lagring fungerer når credentials-raden finnes.

## Implementering

1. **Samle førstegangsinnloggingen i én Edge Function-operasjon**
   - Utvid `dji-login` slik at den kan motta valgene for lagring og autosynk.
   - For en bruker uten personlig nøkkel opprettes en personlig DroneLog-nøkkel før DJI-innloggingen.
   - DJI-kallet gjøres direkte med den nye personlige nøkkelen, ikke først med ugyldig selskapsnøkkel eller den delte globale nøkkelen.

2. **Lagre bare etter vellykket DJI-innlogging**
   - Ved vellykket innlogging lagres DJI-legitimasjon, `dji_account_id`, selskapskobling og den krypterte personlige DroneLog-nøkkelen samlet.
   - Feil DJI-brukernavn/passord skal ikke opprette en gyldig credentials-rad.
   - API-nøkkelen skal aldri returneres til nettleseren eller skrives i logger.

3. **Behold støtte for eksisterende brukere**
   - Eksisterende personlig nøkkel gjenbrukes.
   - En personlig nøkkel som avvises med `401`, fjernes og erstattes én gang før forespørselen feiler.
   - Selskaps/global fallback beholdes for historiske og administrative flyter, men skal ikke være normal førstegangsvei for DJI-innlogging.

4. **Oppdater frontend-flyten**
   - `UploadDroneLogDialog` sender lagrings- og autosynkvalgene sammen med `dji-login`.
   - Det separate `dji-save-credentials`-kallet fjernes fra den normale innloggingsflyten, slik at vi unngår mellomtilstanden som skapte feilen.
   - Eksisterende lokaliserte feil og cooldown-visning beholdes.

5. **Verifisering**
   - Deploy `process-dronelog`.
   - Test første innlogging for `hauggard@gmail.com` når DroneLogs nåværende 429-vindu er utløpt.
   - Bekreft i databasen at én credentials-rad, `dji_account_id` og én kryptert personlig nøkkel er lagret.
   - Test innlogging nummer to og bekreft i loggene at `source=user` brukes, uten nytt `POST /keys` og uten selskaps/global fallback.
   - Kjør TypeScript-validering og kontroller at ingen hemmeligheter vises i logger eller respons.

## Avgrensning

- Ingen databaseskjemaendring eller historisk backfill.
- Ingen sletting eller endring av eksisterende DJI-legitimasjon for andre brukere.
- De separate forbedringene for `dronelog-usage` og workerens 429-håndtering tas ikke med i denne målrettede innloggingsrettingen.
