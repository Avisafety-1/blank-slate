# DJI-importfiltrering: behold dagens oppførsel

Konklusjon etter undersøkelse: ingenting er ødelagt, og ingen endring gjøres i koden.

## Hva som faktisk skjedde

- `hauggard@gmail.com` stod i selskapet Elverum Videregående Skole, mens DJI-kontoen (rikardvb@gmail.com) sine flyturer er importert til Avisafe.
- Annoteringen kjørte riktig, men fant null treff: `110 logger, 0 kjente, 0 selvlært, 0 pending-selvlært`.
- Elverum har fortsatt 0 rader med `dji_file_name` og ingen nye flylogger siste døgn. De 58 pending-loggene og 12 synkjobbene fra i dag ble laget kl. 11:00 UTC av Elverums egne brukere, før innloggingen.
- I Avisafe-selskapet filtreres loggene som forventet.

## Hva annoteringen skriver (og ikke skriver)

Skriver, kun ved treff og kun på tomme felt:

- `flight_logs.dji_log_id`
- `flight_logs.dji_file_name`
- `pending_dji_logs.dji_log_id`

Skriver aldri: nye flylogger, flytid, dato, drone, batteri, loggbokoppføringer. Sletter ingenting.

Treff krever ett av: samme DJI-ID, samme filnavn, eller starttid innen ±3 min og varighet innen ±2 min — og alltid innenfor eget selskap + moderselskap + avdelinger.

## Beslutning

Dagens selskapsavgrensning beholdes uendret. Ingen filer endres.
