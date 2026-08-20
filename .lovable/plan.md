# Live ATC-lyd i AviSafe

Mål: piloter kan lytte til tårn-/approach-frekvenser mens de planlegger og flyr, uten å forlate AviSafe.

## Viktig forbehold først

- Det finnes ingen offentlig API for ATC-lyd. Det praktiske alternativet er ferdige lydstrømmer (mp3/aac over HTTP), typisk fra LiveATC.net.
- Norsk dekning er svært tynn: Avinor-tårn kringkastes normalt ikke på LiveATC. Funksjonen vil derfor være mest nyttig utenfor Norge, eller med egne strømmer.
- LiveATC krever tillatelse for innbygging i kommersielle produkter. Vi bygger derfor løsningen kildeagnostisk: administrator legger inn stream-URLer selv, og LiveATC-oppsett kan legges inn når/hvis avtale er på plass.
- Opptak/lagring av ATC-lyd tas ikke med i denne omgangen (juridisk gråsone). Kun sanntids avspilling.

## Slik blir det for brukeren

**Admin → Innstillinger → ATC-lyd**
- Liste over stasjoner selskapet vil ha tilgjengelig: navn (f.eks. "ENGM Tower"), ICAO-kode, frekvens (valgfri), stream-URL, posisjon (lat/lng) og av/på.
- Kan arves nedover til avdelinger på samme måte som andre selskapsinnstillinger.

**På kartet**
- Ny liten spiller nederst i kartet (samme kompakte stil som IPPC/Sensor-lenkene, ikonfri på mobil).
- Viser nærmeste aktive stasjon basert på kartsenter/oppdragsposisjon, med nedtrekk for å bytte stasjon.
- Play/pause, volum/mute, statusindikator (kobler til / live / ikke tilgjengelig).

**Under aktiv flygning**
- Samme spiller som en kompakt rad i StartFlightDialog / aktiv flygning, forhåndsvalgt til nærmeste stasjon for oppdragets posisjon.
- Avspilling fortsetter når dialogen lukkes (én global lydinstans), slik at pilot kan lytte mens hen bruker appen.

Alle tekster går gjennom `t()` med nøkler i både `no.json` og `en.json`.

## Teknisk

- Ny tabell `atc_stations` (company_id, name, icao, frequency, stream_url, latitude, longitude, is_active, sort_order) med GRANT-er, RLS scoped via `get_user_visible_company_ids()`, og skriverett for admin/superadmin.
- URL-validering: kun `https://`, avvises ellers — både i UI og som DB-trigger, for å unngå mixed content og injeksjon.
- Frontend:
  - `src/hooks/useAtcStations.ts` — henter stasjoner for synlige selskaper, sortert på avstand til gitt posisjon.
  - `src/contexts/AtcAudioContext.tsx` — én delt `HTMLAudioElement`, state for valgt stasjon, play/pause, volum, feilhåndtering og auto-reconnect ved stream-drop.
  - `src/components/atc/AtcPlayer.tsx` — kompakt UI, `variant="map" | "flight"`.
  - `src/components/admin/AtcStationsSection.tsx` — CRUD i admin.
- Avspilling skjer direkte fra klienten mot stream-URL (ingen proxy). Hvis en kilde mangler CORS/HTTPS vises tydelig feilmelding i stedet for stille feil.
- Ingen endring i eksisterende kartlag-logikk; spilleren legges utenfor Leaflet-panene med `pointer-events` isolert så den ikke forstyrrer ruteplanlegging.

## Ikke med nå

- Opptak, transkripsjon eller AI-analyse av ATC-lyd.
- Automatisk katalog over verdens flyplasser — stasjoner legges inn manuelt av admin (vi kan seede noen kjente ICAO-koder senere).
