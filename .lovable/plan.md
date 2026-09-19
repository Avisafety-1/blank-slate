# Live video fra Pilot 2 og FlightHub 2

Ny, separat Fly.io-app som tar imot RTMP-videostrøm fra dronene og viser den
live i AviSafe via WebRTC. Videoserveren står helt for seg selv – ingenting med
MQTT-brokeren å gjøre. Filene bygges her, du kopierer dem til Fly.io og kjører
`fly deploy` selv.

## Hvordan dronen identifiseres

Skjermbildene viser hva DJI faktisk spør om: Pilot 2 «Custom Livestream» tar
kun én RTMP-adresse, mens FlightHub 2 «New Forwarding Channel» tar adresse
pluss valg av enhet og kamerakilde i sin egen meny.

RTMP-strømmen selv inneholder ingen serienummer – det finnes ingen plass i
protokollen for det. Derfor må identiteten ligge i selve adressen, som en
strømnøkkel (helt likt YouTube/Twitch, og samme måte andre drone-plattformer
løser det på: nøkkelen er dronens serienummer eller en generert nøkkel)
[3](https://airwisesolutions.com/wp-content/uploads/2026/09/AirWise-DJI-Livestream-Setup-Guide-091526.pdf).

Vi gjør det så enkelt som mulig:

- Én fast serveradresse for hele AviSafe.
- Én strømnøkkel per drone, generert automatisk når dronen opprettes.
- Adressen limes inn én gang per drone og blir stående – den utløper ikke.
- FH2 velger selv hvilken enhet og kamerakilde kanalen bruker; da trenger man
  bare legge til en valgfri etikett bakerst i adressen (f.eks. `-fpv`) hvis man
  vil kjøre flere kanaler fra samme drone samtidig.

```text
rtmps://live-video-avisafe.fly.dev:1936/live/<strømnøkkel>
```

## Slik fungerer det

```text
Pilot 2 / FlightHub 2  --RTMPS 1936-->  live-video (MediaMTX på Fly.io)
                                             |
Nettleser i AviSafe   <--WebRTC/WHEP 443-----+
```

- Ingen omkoding: H.264 kopieres uendret fra RTMP til WebRTC. Lav forsinkelse
  (~0,5–1,5 s), lite CPU, ingen GStreamer.
- Kun live – ingenting lagres.

## Brukerflyt

1. I AviSafe åpner man dronen og velger «Live video → Oppsett».
2. Der ligger den ferdige adressen med kopiknapp og QR-kode. Den vises også på
   `/dji`-siden på kontrolleren, slik at den kan kopieres rett inn i Pilot 2
   uten å skrives manuelt.
3. Adressen limes inn i Pilot 2 (Custom Livestream → RTMP) eller i FH2
   (New Forwarding Channel → RTMP → Server Address).
4. Så snart dronen sender, dukker «Live»-merket opp og alle med tilgang kan se
   strømmen i AviSafe.

## Sikkerhet og flerkundedrift

- Strømnøkkelen er lang og tilfeldig, lagret hashet, og kan sperres eller
  fornyes per drone. Den avgjør hvilket selskap og hvilken drone strømmen
  tilhører – ingen kunde kan gjette eller se en annen kundes strøm.
- MediaMTX spør en AviSafe-funksjon om lov ved *hver* publisering og
  avspilling. Avspilling bruker et signert token som varer 60 sekunder.
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
- `live-video-auth` – kalles av MediaMTX ved publisering og avspilling; slår
  opp strømnøkkelen, verifiserer avspillingstoken, og registrerer at strømmen
  er i gang (og når den slutter).
- `live-video-access` – kalles av innlogget bruker, sjekker tilgang til dronen
  og returnerer kortlevd WHEP-URL.
- `live-video-setup` – henter eller fornyer dronens strømnøkkel og returnerer
  den ferdige RTMPS-adressen.

**Frontend:**
- `src/components/video/WhepPlayer.tsx` – WHEP-klient med automatisk
  gjenoppkobling (eksponentiell backoff) og statusindikator.
- `src/components/video/LiveVideoDialog.tsx` – avspilling, «ingen strøm ennå»,
  feilmeldinger, og fane for oppsett.
- `src/components/video/StreamSetupCard.tsx` – adresse med kopiknapp, QR-kode,
  «forny nøkkel» og kort veiledning for både Pilot 2 og FlightHub 2.
- «Live video»-knapp på droner (dronelisten fra dashbordet, /ressurser og
  live-panelet under flyging), med live-merke når strømmen er aktiv.
- Adressen vises også på `/dji` når man er logget inn på kontrolleren.
- Alle tekster via `t()` i `no.json` og `en.json` under `liveVideo.*`.

**Database:**
- `drone_stream_keys` – drone, selskap, hashet nøkkel, aktiv, opprettet/rotert.
  GRANT + RLS: lesing/rotering for selskapets administratorer.
- `drone_live_streams` – strømsti, drone, aktiv, startet, sist sett. Skrives av
  `live-video-auth` slik at UI vet når det finnes noe å se.
- Ingen video lagres.

## Tekniske detaljer

- Strømsti i MediaMTX: `live/<strømnøkkel>[-etikett]`. Auth-funksjonen slår opp
  nøkkelen (SHA-256) og finner drone + selskap; avspillings-URL bruker samme
  sti.
- Avspillingstoken: `"<utløp>.<hmac-sha256>"` signert over `<sti>:<utløp>` med
  ny secret `LIVE_VIDEO_TOKEN_SECRET`.
- Nye secrets: `LIVE_VIDEO_TOKEN_SECRET`, `LIVE_VIDEO_BASE_URL`,
  `LIVE_VIDEO_RTMP_HOST`, `LIVE_VIDEO_RTMP_PORT`, `LIVE_VIDEO_RTMP_SCHEME`.
- Pilot 2-feltet viser `rtmp://` som eksempel, men RTMPS på 1936 fungerer;
  serveren aksepterer også ren `rtmp://` på samme port hvis en modell skulle
  nekte TLS (dokumenteres i README som mindre sikkert alternativ).
- `webrtcAdditionalHosts` må settes til Fly-appens offentlige IP
  (`fly ips list`) – ellers feiler avspilling stille etter signalering.
- Én maskin i v1 slik at publiserer og seer alltid treffer samme instans.
- Etter at filene er laget: `cd video-server && fly deploy`, deretter
  `fly ips list` og oppdater `webrtcAdditionalHosts` før ny deploy.
