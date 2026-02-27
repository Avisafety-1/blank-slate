
Mål: Få stabil import av DJI skylogger via API-dokumentert flyt (`GET /api/v1/logs/{accountId}/{logId}/download`) og stoppe 502/500-feil i `process-dronelog`.

1) Oppdater cloud-download flyten i `supabase/functions/process-dronelog/index.ts`
- Bygg primær nedlastings-URL fra docs: `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`.
- Bruk `downloadUrl` fra klient kun som fallback hvis primær-URL feiler.
- Fortsett med headers: `Authorization`, `Accept: application/json`, `Content-Type: application/json`.

2) Gjør nedlasting binærsikker (kritisk fix)
- Fjern `await fileRes.text()` som primær behandling av ikke-JSON.
- Les body som `arrayBuffer()` for ikke-JSON svar og jobb med `Uint8Array`.
- Legg inn innholdsdeteksjon:
  - JSON: parse og hent direkte fil-URL -> kall `POST /logs`.
  - CSV-bytes: dekod til tekst -> parse direkte.
  - ZIP/TXT raw-bytes: send videre til `/logs/upload` uten tekst-reencoding.

3) Hardn multipart-opplasting i samme fil
- Behold rå bytes uendret i multipart body.
- Sett filnavn/extension fra `Content-Disposition` eller magic bytes (`PK` => `.zip`, ellers `.txt`).
- Behold eksisterende `fields[]`-format (kompatibelt med dagens parser-oppsett).
- Legg inn én kontrollert retry-strategi ved upstream 500 (kun én ekstra variant/opplasting).

4) Forbedre feil- og rate-limit håndtering
- Returner tydelig 429-payload fra alle DJI-grener (`download`, `/logs`, `/logs/upload`) med `retryAfter` og ev. `remaining`.
- Skill tydelig mellom upstream 500 fra DroneLog og intern edge-feil i responsfelt.

5) Oppdater klient i `src/components/UploadDroneLogDialog.tsx`
- La `handleSelectDjiLog` bruke `accountId + logId` som primære parametre (downloadUrl valgfri fallback).
- Legg 15s cooldown på “velg logg/import”-kall ved 429 (samme mønster som login-cooldown).
- Deaktiver importknapper under cooldown/prosessering og vis tydelig toast med “vent X sek”.

6) Verifisering etter implementasjon
- Test DJI login -> loggliste -> import for minst to tidligere feilede logger (ZIP-signatur `PK...`).
- Bekreft at resultat-visning åpnes (ikke blank screen) og at parser returnerer data.
- Test 429-flow: knappene går i cooldown, ingen hard runtime-feil, korrekt brukerbeskjed.
- Sjekk `process-dronelog` edge logs for branch-spor: `download type`, `bytes`, `chosen path`, `upstream status`.

Tekniske detaljer (kort)
- Rotårsak 500: binær ZIP fra `/download` ble behandlet som tekst og re-encodet før `/logs/upload`, som korrumperte filinnholdet.
- Docs-aligned løsning: hent via `/logs/{accountId}/{logId}/download`, håndter JSON/CSV/binær hver for seg, og last opp rå bytes ved behov.
