# Fiks og verifiser personlig DroneLog-nøkkel

## Bekreftet feil

Innloggingsforsøket kl. 10:57–10:58 brukte `source=company`, ikke personlig nøkkel, og DroneLog svarte `401 Unauthenticated`.

For Gard finnes:
- lagrede DJI-credentials og cachet DJI account ID
- selskapsnøkkel
- ingen personlig DroneLog-nøkkel

`DRONELOG_AVISAFE_KEY` finnes som Edge Function-secret, men lazy provisjonering ga ingen lagret nøkkel. Dermed falt koden stille tilbake til en ugyldig selskapsnøkkel. Dette forklarer feilmeldingen.

## Implementering

1. Gjør provisjonering eksplisitt og robust i `_shared/dronelog-auth.ts`:
   - bruk master/globalnøkkelen kun til `POST /keys`
   - valider alle aktuelle svarformater fra DroneLog
   - kontroller at den krypterte nøkkelen faktisk ble lagret før den returneres
   - returner strukturert provisjoneringsfeil i stedet for stille fallback

2. Ikke bruk en kjent ugyldig selskapsnøkkel etter provisjoneringsfeil:
   - ved `401 api_key_invalid` på personlig eller selskapsnøkkel, prøv neste nivå én gang i samme kall
   - personlig: slett ugyldig personlig nøkkel, opprett ny og prøv igjen
   - selskap: fall tilbake til global nøkkel
   - aldri gjenta mer enn én gang per nivå

3. Bruk samme fallback-flyt i:
   - interaktiv DJI-innlogging og loggliste (`process-dronelog`)
   - enkeltimport (`dji-process-single`)
   - nattlig kø og worker (`dji-sync-enqueue`, `dji-sync-worker`)

4. Forbedre diagnostikk uten å logge hemmeligheter:
   - logg `source`, HTTP-status og provisjoneringssteg
   - ikke logg nøkkel, e-post, passord eller kryptert verdi
   - returner riktig brukerfeil for ugyldig master-/selskapsnøkkel versus DJI-passord/rate limit

5. Deploy berørte Edge Functions.

## Runtime-verifisering

1. Kjør ny DJI-innlogging for Gard.
2. Bekreft at loggen viser vellykket personlig nøkkeloppretting og `source=user`.
3. Bekreft i databasen at `dronelog_api_key_encrypted` og `dronelog_key_created_at` er satt, uten å lese nøkkelverdien.
4. Kjør handlingen på nytt og bekreft at samme personlige nøkkel og cachet `dji_account_id` gjenbrukes; ingen ny `POST /keys` eller unødvendig `/accounts/dji`.
5. Test én nattlig sync-path og bekreft samme nøkkelresolver.

Ingen ny databaseendring er nødvendig.
