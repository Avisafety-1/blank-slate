
Feilen er funnet i eksisterende implementasjon, ikke i selve sync-flyten:

1) Hovedfeil (som stopper inserts)
- `supabase/functions/dji-auto-sync/index.ts` bygger fallback-tid slik:
  - `CUSTOM.date [UTC] + CUSTOM.updateTime [UTC] -> "${date}T${time}Z"`
- Når `time` er i DJI-format (`2:23:51.84 PM`), blir resultatet f.eks.:
  - `10/16/2024T2:23:51.84 PMZ`
- Dette er ugyldig for `timestamptz`, og matcher nøyaktig feilen i loggene (`22007 invalid input syntax for timestamp with time zone`).
- Derfor blir ingenting lagret i `pending_dji_logs`, og “ventende logger” er tom.

2) Sekundær svakhet i UI
- `pendingLogsRef.current?.refresh()` kjøres kun i suksess-grenen i “Sync nå”.
- Hvis edge-kallet feiler/timeouter etter delvis prosessering, blir ikke listen oppdatert automatisk.

Implementeringsplan

1. Normaliser all DJI-dato i edge-funksjonen
- Legg inn én felles helper i `dji-auto-sync/index.ts`:
  - håndterer ISO-strenger
  - håndterer `M/D/YYYY h:mm:ss(.SS) AM/PM`
  - returnerer alltid ISO (`toISOString()`) eller `null`.

2. Bruk helper konsekvent i fallback-kjeden
- I `parseCsvMinimal`, normaliser:
  - `DETAILS.startTime`
  - `CUSTOM.date [UTC] + CUSTOM.updateTime [UTC]`
  - `CUSTOM.dateTime`
- Ikke bygg `"...PMZ"`-strenger direkte.
- Sett `startTime = null` hvis ikke tolkbar.

3. Hardening ved insert
- `flight_date` settes til:
  - normalisert `parsed.startTime`
  - ellers normalisert `log.date`
  - ellers `null` (ikke ugyldig tekst).
- Da stopper vi timestamp-crash.

4. Gjør resultat synlig selv ved feil
- I “Sync nå”-handleren (`UploadDroneLogDialog.tsx`), flytt `pendingLogsRef.current?.refresh()` til `finally` slik at listen oppdateres også etter error/timeout.

5. Verifisering
- Kjør “Sync nå” igjen.
- Bekreft i edge-logger at `22007` er borte.
- Bekreft at nye rader faktisk finnes i `pending_dji_logs` med `status='pending'`.
- Bekreft at “Ventende flylogger fra auto-sync” viser rader uten å reåpne dialogen.

Tekniske detaljer
- Loggene viser at sync faktisk henter og parser filer (ZIP->TXT fallback fungerer), men insert feiler på `flight_date`.
- Dette betyr at importkjeden er OK; problemet er kun dato-normalisering før DB insert.
- Den konkrete bugen ligger i fallback-formatet for tid, ikke i autentisering, ikke i RLS, og ikke i “pending”-visningen i seg selv.
