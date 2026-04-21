
## Plan: Feilsøke og rette FH2 livestream-start

### Diagnose
Det som ser feil ut nå:

1. **Edge-loggene viser ingen `start-livestream`-kall**
   - De siste loggene for `flighthub2-proxy` viser bare gjentatte `test-connection`.
   - Det betyr at vi enten ikke fikk sendt livestream-kallet fra UI, eller at deploy/preview fortsatt traff en versjon der kallet ikke logger som forventet.

2. **Payloaden matcher ikke DJI-eksempelet**
   - Dokumentasjonen lister feltet `quality_type`, men både request-eksempelet og cURL-eksempelet bruker:
     ```json
     {
       "video_quality": "adaptive"
     }
     ```
   - Dagens proxy sender bare:
     ```json
     {
       "quality_type": "..."
     }
     ```
   - Dette kan forklare `{"code":200500,"message":"internal server error"}`.

3. **Prosjekt-UUID sendes sannsynligvis ikke fra UI**
   - `start-livestream` støtter `projectUuid`, men `LiveStreamDialog` sender bare `deviceSn`, `cameraIndex` og `qualityType`.
   - FH2-tokenet har `organization_uuid`, men ikke `project_uuid`, så `X-Project-Uuid` blir trolig tomt.
   - Auth-dokumentasjonen sier at FH2 autoriserer basert på både `X-User-Token` og `X-Project-Uuid`.

4. **`v1.0`-pathen er trolig ikke riktig for akkurat dette endepunktet**
   - Dokumentasjonssiden heter “OpenAPI V1.0”, men selve endpointet står fortsatt eksplisitt som:
     ```text
     POST /openapi/v0.1/live-stream/start
     ```
   - `manage/api/v1.0/live-stream/start` ga allerede 404.
   - Vi bør derfor prioritere dokumentert `v0.1`, men fortsatt logge fallback-forsøk.

### Endringer

**1. `src/components/admin/FH2DevicesSection.tsx`**
- Send med `project_uuid` fra valgt enhet inn til `LiveStreamDialog`.
- Hvis enheten mangler `project_uuid`, vis det tydelig i debug/rådata slik at vi ser hvorfor `X-Project-Uuid` ikke kan settes.

**2. `src/components/admin/LiveStreamDialog.tsx`**
- Legg til `projectUuid?: string` prop.
- Send `projectUuid` videre til edge-funksjonen:
  ```json
  {
    "action": "start-livestream",
    "deviceSn": "...",
    "cameraIndex": "...",
    "qualityType": "...",
    "projectUuid": "..."
  }
  ```
- Endre kvalitetene til DJI sine faktiske verdier:
  - `adaptive`
  - `smooth`
  - `ultra_high_definition`
- Vis mer nyttig feildetalj i dialogen:
  - valgt SN
  - valgt camera_index
  - projectUuid
  - alle `attempts` fra proxyen

**3. `supabase/functions/flighthub2-proxy/index.ts` — `start-livestream`**
- Endre primærforsøket til dokumentert endpoint:
  1. `/openapi/v0.1/live-stream/start` med `video_quality`
  2. `/openapi/v0.1/live-stream/start` med `quality_type`
  3. `/openapi/v1.0/live-stream/start` med `video_quality`
  4. `/openapi/v1.0/live-stream/start` med `quality_type`
  5. `/manage/api/v1.0/live-stream/start` som siste diagnostiske fallback
- Send alltid:
  ```http
  X-User-Token: <FH2 token>
  X-Request-Id: <uuid>
  X-Language: en
  X-Project-Uuid: <projectUuid når tilgjengelig>
  Content-Type: application/json
  ```
- Returner strukturert respons med:
  ```json
  {
    "ok": false,
    "error": "...",
    "attempts": [...]
  }
  ```
  også når DJI svarer HTTP 200 men `code !== 0`.

**4. Diagnose/deploy-verifisering**
- Etter implementering deployes `flighthub2-proxy`.
- Test at edge-funksjonen faktisk kjører ny kode ved å sjekke at loggene inneholder:
  ```text
  [start-livestream]
  ```
- Hvis DJI fortsatt svarer `200500`, bruker vi `attempts` til å se om feilen følger:
  - manglende/feil `X-Project-Uuid`
  - feil field name (`video_quality` vs `quality_type`)
  - feil path (`v0.1` vs `v1.0`)
  - feil `camera_index`/SN-kombinasjon

### Filer som endres
- `src/components/admin/FH2DevicesSection.tsx`
- `src/components/admin/LiveStreamDialog.tsx`
- `supabase/functions/flighthub2-proxy/index.ts`

### Resultat
Livestream-start testes med den payloaden DJI faktisk viser i eksempelet (`video_quality`), riktig `X-Project-Uuid` sendes fra valgt FH2-prosjekt, og dialogen viser nøyaktig hvilke varianter DJI svarte på. Dette gjør at vi enten får WHEP-URL tilbake, eller får et presist svar på om problemet er rettighet, prosjekt, camera_index eller DJI-endepunktet.
