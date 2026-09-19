# Live video fra Pilot 2 og FlightHub 2

Ny, separat Fly.io-app som tar imot RTMP-videostrøm fra dronene og viser den
live i AviSafe via WebRTC. Videoserveren står helt for seg selv – den har
ingenting med MQTT-brokeren å gjøre. Filene bygges her, du kopierer dem til
Fly.io og kjører `fly deploy` selv.

## Slik fungerer det

```text
Pilot 2 / FlightHub 2  --RTMPS 1936-->  live-video (MediaMTX på Fly.io)
                                             |
Nettleser i AviSafe   <--WebRTC/WHEP 443-----+
```

- Både Pilot 2 og FlightHub 2 har egne innstillinger for tredjeparts
  livestream der man limer inn en RTMP-adresse. AviSafe genererer denne
  adressen per drone og kamera – ingen kommandoer sendes til dronen.
- Ingen omkoding: H.264 kopieres uendret fra RTMP til WebRTC. Lav forsinkelse
  (~0,5–1,5 s), lite CPU, ingen GStreamer.
- Kun live – ingenting lagres.

## Brukerflyt

1. Admin åpner dronen i AviSafe og velger «Live video».
2. AviSafe viser en ferdig RTMPS-adresse med innebygd nøkkel, f.eks.
   `rtmps://live-video-avisafe.fly.dev:1936/<selskap>/<serienummer>/1?token=…`,
   med kopieringsknapp og QR for enkel inntasting på kontrolleren.
3. Adressen limes inn én gang i Pilot 2 (livestream-innstillinger) eller i
   FlightHub 2. Nøkkelen er langlevd, så den kan bli stående.
4. Når dronen sender, ser alle med tilgang strømmen live i AviSafe.

## Sikkerhet og flerkundedrift

- Strømsti: `<selskaps-id>/<serienummer>/<kamera>` – ingen kunde kan gjette
  eller lese en annen kundes strøm.
- MediaMTX spør en AviSafe-funksjon om lov ved *hver* publisering og
  avspilling. Publiseringsnøkkelen er en langlevd nøkkel lagret hashet i
  databasen (kan sperres/regenereres per selskap, som MQTT-credentials i dag).
  Avspilling bruker et signert token som varer 60 sekunder.
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
- `live-video-auth` – kalles av MediaMTX for hver publisering og avspilling;
  slår opp publiseringsnøkkelen, verifiserer avspillingstoken og strømsti.
- `live-video-access` – kalles av innlogget bruker, sjekker tilgang til dronen
  og returnerer kortlevd WHEP-URL.
- `live-video-credentials` – henter/regenererer selskapets publiseringsnøkkel
  og bygger den ferdige RTMPS-adressen for en drone og et kamera.

**Frontend:**
- `src/components/video/WhepPlayer.tsx` – WHEP-klient med automatisk
  gjenoppkobling (eksponentiell backoff) og statusindikator.
- `src/components/video/LiveVideoDialog.tsx` – avspilling, kameravalg,
  «ingen strøm ennå»-tilstand og feilmeldinger.
- `src/components/video/StreamSetupCard.tsx` – RTMPS-adresse med kopiknapp,
  QR-kode og kort oppsettsveiledning for Pilot 2 og FlightHub 2.
- «Live video»-knapp på droner (dronelisten fra dashbordet, /ressurser og
  live-panelet under flyging), synlig når strømmen er aktiv.
- Alle tekster via `t()` i `no.json` og `en.json` under `liveVideo.*`.

**Database:**
- `company_video_credentials` – selskap, hashet publiseringsnøkkel, aktiv,
  opprettet/rotert. GRANT + RLS: kun selskapets administratorer.
- `drone_live_streams` – serienummer, kamera, aktiv, sist sett. Oppdateres av
  `live-video-auth` slik at UI vet når det finnes en strøm å vise.
- Ingen video lagres.

## Tekniske detaljer

- Avspillingstoken: `"<utløp>.<hmac-sha256>"` signert over `<sti>:<utløp>`
  med ny secret `LIVE_VIDEO_TOKEN_SECRET`.
- Publiseringsnøkkel: tilfeldig streng vist én gang ved generering, lagret
  som SHA-256 i `company_video_credentials`.
- Nye secrets: `LIVE_VIDEO_TOKEN_SECRET`, `LIVE_VIDEO_BASE_URL`,
  `LIVE_VIDEO_RTMP_HOST`, `LIVE_VIDEO_RTMP_PORT`, `LIVE_VIDEO_RTMP_SCHEME`.
- `webrtcAdditionalHosts` må settes til Fly-appens offentlige IP
  (`fly ips list`) – ellers feiler avspilling stille etter signalering.
- Én maskin i v1 slik at publiserer og seer alltid treffer samme instans.
  Skalering over én maskin krever delt ruting og tas ikke nå.
- Etter at filene er laget: `cd video-server && fly deploy`, deretter
  `fly ips list` og oppdater `webrtcAdditionalHosts` før ny deploy.
