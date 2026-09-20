# Videoserveren krasjer ved oppstart – rette opp oppsettsfilen

Feilen fra Fly («the app appears to be crashing» under smoke check) kommer med
stor sannsynlighet fra `video-server/mediamtx.yml`, ikke fra AviSafe-koden.

## Hva som er galt

1. **Miljøvariabler blir ikke satt inn i yml-filen.** Linjene
   `authHTTPAddress: ${AUTH_URL}` og `webrtcAllowOrigin: ${WEBRTC_ALLOW_ORIGIN}`
   blir lest helt bokstavelig av MediaMTX. En autentiseringsadresse som er
   teksten `${AUTH_URL}` er ugyldig, og programmet avslutter umiddelbart –
   akkurat det Fly ser som en krasj.
   MediaMTX henter i stedet verdier fra miljøvariabler med prefikset `MTX_`
   (`MTX_AUTHHTTPADDRESS`, `MTX_WEBRTCALLOWORIGIN`), slik README allerede
   beskriver. Yml-filen skal derfor ha trygge, gyldige standardverdier.

2. **MediaMTX avslutter ved ukjente innstillinger.** Hvis en nøkkel er skrevet
   feil eller ikke finnes i den versjonen `bluenviron/mediamtx:latest` gir,
   starter den ikke. Filen må derfor kontrolleres mot versjonen som faktisk
   kjører.

3. **Sti-oppsettet nederst** (`paths: all_others:`) må ha en gyldig verdi, ikke
   stå tomt uten innhold.

## Foreslåtte endringer

- `video-server/mediamtx.yml`
  - Fjern `${...}`-plassholderne. Sett `authHTTPAddress` til den faktiske
    AviSafe-adressen som standard, og `webrtcAllowOrigin: "*"` som standard
    (begge kan fortsatt overstyres med `MTX_...`-secrets på Fly).
  - Rydd bort innstillinger som ikke finnes i gjeldende MediaMTX-versjon, og
    behold kun de som trengs: logg, av-skruing av ubrukte protokoller, RTMP inn,
    WebRTC ut, HTTP-autentisering.
  - Gi `all_others` et gyldig innhold.
- `video-server/README.md` – presiser at yml-verdiene er standarder og at
  `MTX_`-secrets overstyrer dem, og legg inn kommandoen for å se hvorfor
  maskinen krasjer (`fly logs -a video-server-app`).

Ingen endringer i AviSafe-appen eller edge-funksjonene; de peker allerede på
`video-server-app.fly.dev`.

## Etter endringen

1. `fly deploy` på nytt.
2. `fly ips list` og sett `MTX_WEBRTCADDITIONALHOSTS` til den offentlige
   IP-adressen, deretter deploy en gang til – uten denne blir bildet aldri vist
   selv om tilkoblingen ser vellykket ut.

Hvis maskinen fortsatt krasjer etter dette, trenger jeg de siste linjene fra
`fly logs -a video-server-app`; de sier nøyaktig hvilken linje i oppsettet
MediaMTX ikke godtar.
