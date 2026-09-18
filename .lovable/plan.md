# MSL-høyde først ved SafeSky live-deling

## Situasjonen i dag
Live-publiseringen bruker allerede `altitude_m` (MSL) fra `flighthub2_positions` når den finnes, og faller tilbake på terrenghøyde + AGL ellers.

Men kontrollen av dagens data viser en reell feil: DJI sender `elevation: 0` når MSL ikke er tilgjengelig (uten RTK), og MQTT-broen lagrer da `altitude_m = 0`. Alle fire ferske radene har `altitude_m = 0` med høyder på 57–600 m over bakken. Fordi 0 teller som en gyldig verdi, sendes dronene til SafeSky med høyde 0 moh. i stedet for terreng + AGL.

## Det som skal gjøres

1. **Behandle 0/manglende MSL som «ikke tilgjengelig»**
   - I live-publiseringen brukes `altitude_m` kun når den er et tall og ikke 0 (og ikke urimelig i forhold til AGL). Ellers: terrenghøyde + AGL som i dag.
   - Samme regel i webhooken som speiler posisjoner videre, slik at begge kilder oppfører seg likt.

2. **Ikke lagre falsk 0 i utgangspunktet**
   - MQTT-broen lagrer `altitude_m = null` når DJI rapporterer `elevation` som 0 eller mangler, slik at bare ekte RTK-MSL havner i feltet. `height_m` (AGL) lagres uendret, og `raw` beholder alt som før.

3. **Rydd historikken**
   - Sett `altitude_m = null` på eksisterende rader der verdien er 0 men `height_m` er større enn 0, så den gamle 0-verdien ikke publiseres videre.

## Resultat
Når dronen faktisk rapporterer MSL (RTK), sendes den verdien direkte til SafeSky. Ellers beregnes høyden som i dag: terrenghøyde fra høyde-API-et pluss dronens høyde over bakken. Eksempelpunktet ditt (65.0635, 11.6764, terreng ca. 10 moh., 57,5 m AGL) blir da ca. 68 moh. i stedet for 0.

## Teknisk
- `supabase/functions/safesky-live-publish/index.ts`: hjelpefunksjon `usableAmsl(p)`; terrain-nøkler samles for posisjoner uten brukbar MSL.
- `supabase/functions/flighthub2-airspace-webhook/index.ts`: samme regel i linje ~324 og ~364.
- `mqtt-broker/bridge.py`: `altitude_m` settes kun når `elevation`/`altitude` er et tall ulikt 0 (krever `fly deploy` av broker-appen).
- Engangs-SQL: `update flighthub2_positions set altitude_m = null where altitude_m = 0 and coalesce(height_m,0) > 0;`
- Deploy av begge edge functions; ingen endringer i advisory-flyten.
