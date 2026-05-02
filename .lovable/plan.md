Jeg fant årsaken: Fly.io blir faktisk truffet. Feilen `Route POST://parse not found` kommer av at Supabase-secret `DJI_PARSER_URL` trolig slutter med `/`. Koden legger selv på `/parse`, så URL-en blir `https://djilogparser.fly.dev//parse`. Fastify tolker da ruten som `//parse`, som gir akkurat samme 404 som i Fly-loggene.

Plan:

1. Gjør Edge Function robust mot trailing slash
   - Endre URL-byggingen i `process-dronelog` slik at `DJI_PARSER_URL` normaliseres før `/parse` legges på.
   - Eksempel: `https://djilogparser.fly.dev/` og `https://djilogparser.fly.dev` skal begge bli `https://djilogparser.fly.dev/parse`.

2. Gjør samme fiks i proxy-funksjonen
   - `dji-parse-proxy` bruker samme mønster (`${PARSER_URL}/parse`) og bør få samme normalisering, ellers kan samme feil dukke opp der senere.

3. Bedre logging
   - Logg normalisert parser-base uten å vise token.
   - Logg upstream body ved ikke-OK svar, slik at 404/401/422 blir enklere å skille fremover.

4. Deploy og verifiser
   - Deploy `process-dronelog` og `dji-parse-proxy`.
   - Test at POST mot Fly går til `/parse` og ikke `//parse`.
   - Etter at du laster opp på nytt, sjekker jeg Supabase-loggene for `served by Fly parser` eller eventuell parser-feil.

Merk: Du trenger ikke endre secret igjen hvis den nå står med trailing slash; koden skal tåle begge varianter etter fiksen.