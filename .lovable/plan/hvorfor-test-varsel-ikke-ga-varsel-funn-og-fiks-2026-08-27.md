# Hvorfor «Test varsel» ikke ga varsel — funn og fiks

## Hva jeg fant

Oppdraget «Test varsel» (start 27.08 20:50 lokal) er korrekt satt opp:
- support-brukeren står som tildelt personell
- innstillinger: e-post PÅ, SMS PÅ, 7 minutter før start
- cron-jobben kjørte 18:45 UTC (5 min før start) og markerte varselet som sendt i `mission_start_alert_sends`

Så jobben trigget riktig. Problemet ligger i selve utsendingen:

**Bekreftet feil:** funksjonen henter `navn` fra `profiles`, men den kolonnen finnes ikke (den heter `full_name`). Hele profil-oppslaget feiler stille, så:
- telefonnummeret blir `undefined` → **SMS ble aldri sendt** (hoppes over uten feilmelding)
- navnet i e-posten ville blitt tomt («Hei ,»)

**Ikke bekreftet:** e-posten. Funksjonsloggen viser ingen «Email failed», så Resend-kallet så ut til å gå gjennom, men vi logger ikke Resend-ID eller resultat, så vi kan ikke bevise levering. Det må instrumenteres før vi kan konkludere.

## Hva jeg gjør

1. **Fiks profil-oppslaget** i `supabase/functions/check-mission-start-alerts/index.ts`: bruk `full_name` i stedet for `navn`, og logg feil fra profil-, prefs- og sends-spørringene i stedet for å svelge dem.
2. **Logg utsending**: logg Resend-svar (id) og SMS-status per mottaker, samt hvorfor en mottaker eventuelt hoppes over (mangler telefon, kanal av, allerede sendt).
3. **Ikke marker som sendt ved total feil**: rad i `mission_start_alert_sends` skrives kun hvis minst én kanal faktisk lyktes — ellers prøver neste kjøring på nytt.
4. **Rydd opp testraden** for «Test varsel» slik at du kan teste på nytt uten å lage nytt oppdrag.
5. Kjøre funksjonen manuelt etterpå og lese loggen for å bekrefte at både e-post (Resend-id) og SMS går ut.

## Utenfor omfang

Ingen endringer i andre varslingstyper, cron-oppsett, RLS eller UI.
