

## Plan: Live stream fra DJI Dock 3 (FH2 OpenAPI)

### Bakgrunn
DJI FlightHub 2 OpenAPI v0.1 har et `live-stream/start`-endepunkt som returnerer en **WHEP (WebRTC over HTTPS)** pull-URL. Strømmen avsluttes automatisk hvis ingen seer kobler seg til innen 5 minutter, og en `video_expire`-token bestemmer total varighet.

**Endepunkt:**
```
POST /openapi/v0.1/live-stream/start
Body: { sn, camera_index, video_expire, quality_type }
Resp: { code, data: { url, url_type: "srs", expire_ts } }
```

`camera_index` (f.eks. `"165-0-7"`) hentes fra `drone.camera_list` i list-devices (vi normaliserer allerede `camera_list` i proxyen).

### Endringer

**1. `supabase/functions/flighthub2-proxy/index.ts` — ny action `start-livestream`**
- Input: `deviceSn`, `cameraIndex`, valgfritt `qualityType` (default `"adaptive"`), `videoExpire` (default 7200s).
- Sender POST mot `${fh2BaseUrl}/openapi/v0.1/live-stream/start` med samme HMAC-headers og `X-Project-Uuid` som andre actions.
- Returnerer `{ url, urlType, expireTs }`. Logger feil med endpoint-URL for diagnose.

**2. `src/components/admin/FH2DevicesSection.tsx` — UI for å starte og se strøm**
- Ny kolonne / knapp «Live» per drone-rad (vises kun hvis `online_status === 1`, `type === 0` (drone) og `camera_list?.length > 0`).
- Klikk åpner `LiveStreamDialog`:
  - Velg kamera (dropdown over `camera_list`, f.eks. «Wide / Zoom / Thermal»).
  - Velg kvalitet (Auto, Smooth, HD, Ultra HD).
  - «Start strøm»-knapp → kaller `flighthub2-proxy` med `action: "start-livestream"`.
  - Når svar kommer: viser strømmen i en innebygd WebRTC-spiller via `<iframe>` mot et **WHEP-kompatibelt JS-bibliotek** lastet client-side. Vi bruker [`whip-whep`-pattern via `RTCPeerConnection`](https://github.com/Eyevinn/webrtc-player) — minimal egen implementasjon: ny komponent `WhepPlayer.tsx` som tar `url` prop og setter opp `RTCPeerConnection` med SDP offer/answer mot WHEP-endpoint.
  - Viser `expire_ts`-nedtelling og «Stopp»-knapp (lukker peer-connection lokalt; FH2 stenger automatisk etter 5 min uten seer).

**3. Ny komponent `src/components/admin/WhepPlayer.tsx`**
- Standard WHEP-klient: oppretter `RTCPeerConnection`, legger til `recvonly`-transceivers for video/audio, sender SDP offer som POST til WHEP-URL, setter remote description fra svaret, kobler stream til `<video autoPlay playsInline muted>`.
- Håndterer feil og connection-state (Connecting / Live / Disconnected) med tydelig status-indikator.
- Cleanup på unmount (`pc.close()`).

### Begrensninger / antakelser
- DJI sitt SRS-endepunkt (`http://47.96.144.147:30806/...`) i dokumentasjonseksempelet er **HTTP**, ikke HTTPS. Hvis produksjons-tokens også returnerer HTTP-URL, vil moderne nettlesere blokkere blandet innhold på en HTTPS-side. **Mitigering:** vise URL-en og en tydelig melding hvis WHEP-URL er `http://` («Åpne i ny fane / VLC»), pluss en «Kopier URL»-knapp. Dersom DJI returnerer HTTPS i kundens region, fungerer playeren direkte.
- Endepunktet er merket «Developing» i dokumentasjonen – kan kreve at FH2-tenant har livestream-modulen aktivert. Ved 4xx-feil viser vi rå svaret (samme mønster som `debug-endpoint`).
- Camera-index oppdages fra eksisterende `list-devices`-svar; ingen ekstra API-kall trengs for å bygge dropdown.

### Filer som endres / opprettes
- `supabase/functions/flighthub2-proxy/index.ts` — ny `start-livestream`-action
- `src/components/admin/FH2DevicesSection.tsx` — Live-knapp + dialog
- `src/components/admin/WhepPlayer.tsx` — ny WHEP WebRTC-spiller
- `src/components/admin/LiveStreamDialog.tsx` — ny dialog med kamera/kvalitet-valg + player

### Resultat
Admin kan klikke «Live» på en online drone i FH2-listen, velge kamera + kvalitet, og se WebRTC-strømmen direkte i Avisafe. Hvis nettverket/protokollen ikke tillater innebygd avspilling, får man kopierbar URL som fallback.

