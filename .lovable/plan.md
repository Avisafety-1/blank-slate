Jeg fant årsaken i loggene:

- DJI kaller riktig URL: `GET /v1/uav?lat=22.5431&lng=114.0579&radius=100`
- Den sender `Authorization: SS-HMAC ...` med `Credential=zU0s7lEmuRSk6XkBTQh06A/v1`, `SignedHeaders=host;x-ss-date;x-ss-nonce` og signatur.
- Endepunktet vårt parser foreløpig ikke `SS-HMAC`, så det finner ingen nøkkel og svarer `401`.
- I tillegg er `fh2_airspace_feed_config` tom, så det finnes ingen lagret feed-nøkkel/secret å matche mot akkurat nå.

Plan:

1. **Oppdater feed-konfigurasjonen**
   - Sørge for at admin-funksjonen faktisk oppretter/lagrer feed-nøkkel for selskapet.
   - Vurdere å lagre HMAC-oppsett som `key_id` + kryptert secret, eller bruke eksisterende API-nøkkel som både credential-id og HMAC-secret dersom DJI kun støtter ett felt.

2. **Støtt DJI sin `SS-HMAC-SHA256-V1` i `flighthub2-airspace-feed`**
   - Parse `Authorization`-headeren:
     - `Credential=...`
     - `SignedHeaders=...`
     - `Signature=...`
   - Trekke ut nøkkel-id fra `Credential` før `/v1`.
   - Slå opp riktig selskap og dekryptert secret i databasen.
   - Verifisere `x-ss-date` med maks tidsavvik, `x-ss-nonce`, canonical request og HMAC-signaturen.

3. **Returner DJI-forventet verify-respons**
   - Ved gyldig signatur: `200` med `{ "code": 0, "message": "success", "data": [] }`.
   - Ved feil: tydelig `401` og loggføring av årsak uten å eksponere secret/signatur.

4. **Rydd loggingen etter diagnose**
   - Re-maskere `Authorization` i `fh2_airspace_feed_log`.
   - Logge bare trygg metadata: scheme, credential-prefix, signedHeaders, status og failure reason.

5. **Teste og deploye edge function**
   - Teste med Supabase edge-function curl/logg.
   - Deploye `flighthub2-airspace-feed` og eventuelt `flighthub2-airspace-feed-config`.
   - Etterpå trykker du Verify én gang til i FH2, og vi bekrefter at status blir `200`.