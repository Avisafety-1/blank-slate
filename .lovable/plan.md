# Behold riktig DroneLog-nøkkel gjennom én DJI-økt

## Bekreftet hendelsesforløp

- Kl. 11:20:13 UTC lyktes `dji-login` for `hauggard@gmail.com` med HTTP 200 og returnerte DJI-konto-ID.
- Forespørselen hadde `saveCredentials: false`, så ingen personlig nøkkel eller DJI-legitimasjon skulle lagres.
- Kl. 11:20:14 og 11:20:15 feilet `dji-list-logs` med HTTP 401 `Unauthenticated`.
- Årsaken er at hver Edge Function-forespørsel løser nøkkelen på nytt. Innloggingen fant en fungerende fallback etter at selskapsnøkkelen ble avvist, men neste listekall begynte igjen med den ugyldige selskapsnøkkelen.
- Dette er derfor ikke feil DJI-brukernavn eller passord; selve DJI-innloggingen var vellykket.

## Fiks

1. **Behold nøkkelkilden for den aktive importøkten**
   - `dji-login` returnerer kun hvilken server-side nøkkelkilde som lyktes (`user`, `company` eller `global`) — aldri selve API-nøkkelen.
   - Frontend oppbevarer denne ufarlige kildeverdien bare i dialogens minne.

2. **Bruk samme server-side nøkkel i påfølgende kall**
   - Send nøkkelkilden med `dji-list-logs` og `dji-process-log`.
   - Edge Function validerer verdien mot en fast tillatt liste og slår selv opp den aktuelle nøkkelen; klienten kan aldri levere nøkkelmateriale.
   - Hvis den valgte nøkkelen avvises, kjøres eksisterende engangs-recovery uten gjentatte kall.

3. **Behold eksisterende personlige nøkkelflyt**
   - Når «lagre innlogging» er aktivert, opprettes og lagres personlig nøkkel som allerede implementert, og senere kall bruker `source=user`.
   - Når lagring er avslått, lagres verken passord eller personlig nøkkel; den fungerende nøkkelkilden beholdes kun mens importdialogen er åpen.

4. **Verifisering**
   - Deploy `process-dronelog` og kjør TypeScript-validering.
   - Test med lagring avslått: innlogging, listing og åpning av logg skal bruke samme nøkkelkilde uten 401.
   - Test med lagring aktivert: første innlogging skal lagre personlig nøkkel, og neste innlogging skal gjenbruke `source=user`.
   - Kontroller at API-nøkler aldri returneres til frontend eller skrives i logger.

## Avgrensning

- Ingen databaseskjemaendring eller historisk backfill.
- Ingen endring av DJI-passord eller eksisterende credentials-rader.
