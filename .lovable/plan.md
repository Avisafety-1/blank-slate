# Live video fra Pilot 2 og FlightHub 2

Ny, separat Fly.io-app som tar imot RTMP-videostrøm fra dronene og viser den
live i AviSafe via WebRTC. Filene bygges her, du kopierer dem til Fly.io og
kjører `fly deploy` selv.

## Slik fungerer det

```text
Pilot 2 / FlightHub 2  --RTMPS 1936-->  live-video (MediaMTX på Fly.io)
                                             |
Nettleser i AviSafe   <--WebRTC/WHEP 443-----+
```

- Ingen omkoding: H.264 kopieres uendret fra RTMP til WebRTC. Lav forsinkelse
  (~0,5–1,5 s), lite CPU, ingen GStreamer.
- Kun live – ingenting lagres.
- Én strøm per drone og kamera, adskilt per selskap.

## Slik startes strømmen

1. Bruker trykker «Vis live video» på en drone som flyr.
2. AviSafe ber om en publiserings-URL og sender kommandoen `live_start_push`
   til dronen over MQTT-brokeren vi allerede har (DJI Cloud API, url_type = 1
   RTMP). Dronen begynner å pushe til vår videoserver.
3. AviSafe henter en kortlevd avspillings-URL og spiller av strømmen.
4. Når siste seer lukker vinduet, sendes `live_stop_push`.

FlightHub 2-droner bruker samme MQTT-vei (samme broker/telemetri-kobling som i
dag), så begge kilder havner i samme videoserver.

## Sikkerhet og flerkundedrift

- Strømsti: `<selskaps-id>/<serienummer>/<kamera>` – ingen kunde kan gjette
  eller lese en annen kundes strøm.
- MediaMTX spør en AviSafe-funksjon om lov ved *hver* publisering og
  avspilling. Publisering krever et kortlevd signert token (1 time),
  avspilling et token som varer 60 sekunder.
- Avspilling gis til alle innloggede brukere som allerede har tilgang til
  dronen (samme selskaps-/hierarkiregler som ellers i AviSafe).
- Kun WebRTC-signalering (443) og RTMPS (1936) er åpne utad; alt annet i
  MediaMTX er slått av.

## Filer som lages

**Ny mappe `video-server/` (kopieres til Fly.io):**
- `Dockerfile` – basert på `bluenviron/mediamtx`, ingen omkoding.
- `mediamtx.yml` – RTMP inn, WebRTC/WHEP ut, HTTP-auth mot AviSafe, tillatte
  nettsteder (app.avisafe.no, login.avisafe.no, preview-URL).
- `fly.toml` – app `live-video-avisafe`, region ams, tre tjenester:
  443/80 → 8889 (WHEP), 1936 → 1935 (RTMPS), 8189 (WebRTC over TCP),
  `min_machines_running = 1`, 512 MB.
- `README.md` – deploy, secrets, feilsøking, hvorfor bare én maskin.

**Nye edge functions:**
- `live-video-auth` – kalles av MediaMTX for hver publisering/avspilling,
  verifiserer HMAC-token og strømsti. Ingen JWT.
- `live-video-access` – kalles av innlogget bruker, sjekker tilgang til dronen
  og returnerer kortlevd WHEP-URL.
- `live-video-control` – starter/stopper strømmen: lager publiserings-token,
  bygger RTMPS-URL og ber brokeren sende `live_start_push` / `live_stop_push`
  til dronen, samt henter `live_capacity` (hvilke kameraer som finnes).

**Endring i `mqtt-broker/`:**
- `bridge.py` får en liten intern HTTP-kontroll-API (kun Fly-internt nett +
  delt hemmelighet) som publiserer DJI-tjenestemeldinger på
  `thing/product/{sn}/services` og leser svaret fra `services_reply`.
- `live_capacity` fra `thing/product/{sn}/state` lagres slik at UI vet hvilke
  kameraer dronen tilbyr.

**Frontend:**
- `src/components/video/WhepPlayer.tsx` – WHEP-klient med automatisk
  gjenoppkobling (eksponentiell backoff) og statusindikator.
- `src/components/video/LiveVideoDialog.tsx` – kameravalg, kvalitetsvalg,
  start/stopp, feilmeldinger.
- «Vis live video»-knapp på droner som er live (dronelisten fra dashbordet,
  /ressurser og live-panelet under flyging).
- Alle tekster via `t()` i `no.json` og `en.json` under `liveVideo.*`.

**Database:**
- `drone_live_capabilities` (selskap, serienummer, kameraliste, sist oppdatert)
  med GRANT + RLS på selskapstilgang.
- Ingen videodata lagres.

## Tekniske detaljer

- Token: `"<utløp>.<hmac-sha256>"` signert over `publish:<sti>:<utløp>` eller
  `<sti>:<utløp>`, med ny secret `LIVE_VIDEO_TOKEN_SECRET`.
- Nye secrets: `LIVE_VIDEO_TOKEN_SECRET`, `LIVE_VIDEO_BASE_URL`,
  `LIVE_VIDEO_RTMP_HOST/PORT/SCHEME`, samt broker-siden
  `MQTT_CONTROL_SECRET`.
- `webrtcAdditionalHosts` må settes til Fly-appens offentlige IP
  (`fly ips list`) – ellers feiler avspilling stille etter signalering.
- Kvalitet sendes som `video_quality` (0 adaptiv … 4 ultra HD) i
  `live_start_push`; `video_id` er `{sn}/{camera_index}/{video_index}` fra
  `live_capacity`.
- Én maskin i v1 slik at publiserer og seer alltid treffer samme instans.
  Skalering over én maskin krever delt ruting og tas ikke nå.
- Etter at filene er laget: `cd video-server && fly deploy`, deretter
  `fly ips list` og oppdater `webrtcAdditionalHosts` før ny deploy.
