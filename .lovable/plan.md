Jeg fant hvorfor dette fortsatt skjer: forrige fiks ble lagt inn i `process-dronelog`, men DJI Cloud-flyten bruker også `dji-auto-sync` og `dji-process-single`. Begge disse har fortsatt hardkodet `Content-Type: application/octet-stream` når de videresender DJI Cloud-filen til DroneLog `/logs/upload`. Det gir samme 422-feil: `The file field must be a file of type: txt, zip`.

Plan:

1. Oppdatere `supabase/functions/dji-auto-sync/index.ts`
   - Endre upload-helperen til å sette MIME basert på filtype:
     - `.zip` -> `application/zip`
     - `.txt` -> `text/plain; charset=utf-8` eller `text/plain`
   - Beholde ZIP -> TXT fallback når ZIP-opplasting feiler.
   - Sørge for at fallback-TXT også sendes med korrekt MIME.

2. Oppdatere `supabase/functions/dji-process-single/index.ts`
   - Samme MIME-fiks som over.
   - Dette er funksjonen som brukes når en ventende DJI-logg åpnes/behandles manuelt fra køen.

3. Herding av `process-dronelog` slik at den er konsekvent
   - Flytte/standardisere MIME-valg til samme logikk som de to andre funksjonene.
   - Eventuelt sette TXT til `text/plain; charset=utf-8` hvis DroneLog fortsatt avviser ren `text/plain`.
   - Legge inn tydeligere logging for filnavn, extension og MIME ved upload, uten å logge tokens/passord.

4. Verifisere etter endring
   - De deployede edge functionene testes/observeres via Supabase logs.
   - Forventet resultat: DJI Cloud download lykkes, ZIP forsøkes, og hvis DroneLog gir 500 på ZIP, fallback til TXT skal ikke lenger stoppe på 422.

Berørte filer:
- `supabase/functions/dji-auto-sync/index.ts`
- `supabase/functions/dji-process-single/index.ts`
- `supabase/functions/process-dronelog/index.ts`

Ingen databaseendring trengs.