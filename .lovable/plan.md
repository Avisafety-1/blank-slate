## Mål
Få kart-popups for luftfartøy/droner til å føles mer som SafeSky: ett felles kort med samme felter, og et tydelig **Kilde**-felt som forteller hvor data kommer fra. Fjerne den lille teksten "Advisory publisert til SafeSky".

## Hva SafeSky beacon-APIet faktisk leverer
SafeSkys `/v1/beacons` returnerer per beacon (typisk):

- `id`, `source` (f.eks. `flarm`, `ogn`, `adsb`, `safesky`, `icao`)
- `latitude`, `longitude`, `altitude` (m)
- `course` (°), `ground_speed` (m/s), `vertical_speed` (m/s)
- `beacon_type` (`UAV`, `AIRCRAFT`, `LIGHT_AIRCRAFT`, `HEAVY_AIRCRAFT`, `HELICOPTER`, `GLIDER`, `DOT` …)
- `callsign` / `call_sign`
- `aircraft_model` / `aircraft_type` (når tilgjengelig)
- `registration` (ofte tilgjengelig på FLARM/OGN/ADS-B)
- `squawk` (mode-S transponderkode)
- `on_ground` (boolean)
- `last_update` (ISO-tid)
- `accuracy`, `altitude_accuracy` (meter)

I dag persisteres bare: `latitude/longitude/altitude/course/ground_speed/vertical_speed/beacon_type/callsign`. Resten kastes i edge-funksjonen `safesky-beacons-fetch`.

## Endringer

### 1) Lagre flere SafeSky-felter
Migrasjon på `public.safesky_beacons` — legge til kolonnene:
- `source text` (rå SafeSky-kilde, f.eks. "flarm")
- `aircraft_model text`
- `registration text`
- `squawk text`
- `on_ground boolean`
- `accuracy_m numeric`
- `last_update timestamptz`

Eksisterende rader får `null` — popup-en bruker fallback "—" der felter mangler.

### 2) Edge function `safesky-beacons-fetch`
Mappe disse feltene fra SafeSky-responsen og inkludere dem i `upsert`. Ingen logikkendring ellers.

### 3) Felles popup-helper (`src/lib/mapTrafficPopup.ts` — ny)
Lager én HTML-renderer som brukes av:
- SafeSky-beacons (`mapSafeSky.ts`)
- AviSafe advisory-polygoner og senterpunkt (`mapDataFetchers.ts → fetchActiveAdvisories`)
- Live DroneTag/AviSafe-telemetri (`fetchDroneTelemetry`)

Felles felt-rader (vises bare hvis verdi finnes):
```text
Callsign            <callsign | drone_id | "Ukjent">
Type                <beacon_type pent formatert>
Modell              <aircraft_model>
Registrering        <registration>
Høyde               <m> m  (<ft> ft)
Fart                <kt> kt  (<m/s> m/s)
Vertikalfart        ±<m/s> m/s   (kun hvis ≠ 0)
Kurs                <°>
Squawk              <squawk>
Status              "På bakken" | "I luften"
Oppdatert           <HH:mm:ss lokal>
─────────────
Kilde               <SafeSky (flarm) | AviSafe → SafeSky | AviSafe (DroneTag)>
```

Kilde-feltet får liten font + dempet farge, men er en egen rubrikk – ikke "Via SafeSky"-tekst som i dag.

### 4) Fjerne "Advisory publisert til SafeSky"
I `fetchActiveAdvisories` (`src/lib/mapDataFetchers.ts` linje 496–524) bytter vi begge popup-blokkene (polygon + senterpunkt) til den nye renderer-en med `source: "AviSafe → SafeSky"`. For polygonen brukes kun callsign (oppdragstittel hvis tilgjengelig — vi joiner inn `missions.tittel` når `mission_id` finnes; ellers "Aktiv flytur").

Plukker også opp drone-info fra `active_flights` hvis vi har den (modell/registrering via join på `drones`) for at popup-en skal være konsistent.

### 5) Live drone-telemetri
`fetchDroneTelemetry` får samme renderer. Vi joiner `drones` på `drone_id` for å vise modell + registrering. Kilde = `"AviSafe (DroneTag)"` når `active_flights.dronetag_device_id` finnes for samme drone-id, ellers `"AviSafe"`.

### 6) Type-pen formatering
Liten utility `formatBeaconType()`:
- `UAV` → "Drone"
- `LIGHT_AIRCRAFT` → "Lett fly"
- `HEAVY_AIRCRAFT` → "Tungt fly"
- `HELICOPTER` → "Helikopter"
- `GLIDER` → "Seilfly"
- `DOT` → "Ukjent fartøy"
- ellers `beaconType` rå.

## Filer som endres
- `supabase/migrations/<ny>` — nye kolonner på `safesky_beacons`.
- `supabase/functions/safesky-beacons-fetch/index.ts` — utvidet mapping + upsert.
- `src/lib/mapTrafficPopup.ts` — ny felles popup-renderer + type-formatter.
- `src/lib/mapSafeSky.ts` — bruke renderer-en, sende alle nye felter.
- `src/lib/mapDataFetchers.ts` — bruke renderer-en for advisories og live telemetri; fjerne "Advisory publisert til SafeSky"-tekst.

Ingen endringer i selve ikonene eller layer-håndteringen — kun popup-innhold, datalagring og en delt visningsstandard.

## Verifisering
1. Åpne kart, slå på SafeSky-laget → klikk en beacon: alle relevante rader vises, "Kilde: SafeSky (flarm)".
2. Start advisory-flytur → polygon-popup viser oppdragsnavn, dronemodell og "Kilde: AviSafe → SafeSky" (ingen gammel tekst).
3. Aktiv DroneTag-flytur → live drone-popup har samme felter, "Kilde: AviSafe (DroneTag)".
