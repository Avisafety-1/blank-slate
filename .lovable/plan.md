
# Utvid flyspor med komplett telemetridata og hoydevisning

## Oversikt
SafeSky gir allerede mer data enn det som lagres i flight_track. Tabellen `dronetag_positions` lagrer faktisk `alt_msl`, `speed`, `heading` og `vert_speed`, men nar flysporet hentes ved flyslutt brukes kun `lat, lng, alt_agl, timestamp`. Losningen er a inkludere alle tilgjengelige felter i flight_track og deretter vise dem interaktivt pa kartet.

## Hva SafeSky gir oss (allerede lagret i dronetag_positions)
| Felt | Kolonne | Status |
|------|---------|--------|
| Posisjon | lat, lng | Brukes i dag |
| Hoyde MSL | alt_msl | Lagret, men ikke med i flight_track |
| Hoyde AGL | alt_agl | Brukes i dag (men er alltid null/0 fra SafeSky) |
| Hastighet | speed | Lagret, men ikke med i flight_track |
| Retning | heading | Lagret, men ikke med i flight_track |
| Vertikal hastighet | vert_speed | Lagret, men ikke med i flight_track |
| Tidspunkt | timestamp | Brukes i dag |

**Merk**: SafeSky gir kun MSL-hoyde (over havet), ikke AGL (over bakken). Dagens kode henter `alt_agl` som typisk er null. Vi bor hente `alt_msl` i stedet og vise det som "hoyde (MSL)".

## Endringer

### 1. Utvid flight_track data ved lagring (`useFlightTimer.ts`)
Endre `fetchFlightTrack`-funksjonen til a hente alle felter fra `dronetag_positions`:

- Utvid select: `lat, lng, alt_msl, alt_agl, speed, heading, vert_speed, timestamp`
- Lagre alle felter i flight_track-objektet:
```text
{
  lat, lng,
  alt_msl,     // hoyde over havet (fra SafeSky)
  alt_agl,     // hoyde over bakken (hvis tilgjengelig)
  speed,       // hastighet m/s
  heading,     // retning i grader
  vert_speed,  // vertikal hastighet m/s
  timestamp
}
```

### 2. Utvid FlightTrackPosition-interface
Oppdatere `FlightTrackPosition` i bade `MissionMapPreview.tsx` og `ExpandedMapDialog.tsx`:

```text
interface FlightTrackPosition {
  lat: number;
  lng: number;
  alt?: number;          // bakoverkompatibel (legacy)
  alt_msl?: number;      // hoyde over havet
  alt_agl?: number;      // hoyde over bakken
  speed?: number;        // m/s
  heading?: number;      // grader
  vert_speed?: number;   // m/s
  timestamp?: string;
}
```

### 3. Interaktiv hoydevisning pa kartet (`ExpandedMapDialog.tsx` og `MissionMapPreview.tsx`)

**a) Klikkbare punkter pa flyspor**
Legge til usynlige sirkelmarkorer langs flysporet (ca. hvert 3.-5. punkt for ytelse) som viser en popup ved klikk:

```text
Punkt 14 av 87
--------------
Hoyde (MSL): 45 m
Hastighet:   12.3 m/s
Retning:     245deg
Vert. hast.: -0.5 m/s
Tidspunkt:   14:23:45
```

**b) Maks-hoyde badge i ExpandedMapDialog**
Beregne og vise statistikk i bunnteksten:

```text
[--- Planlagt rute]  [--- Faktisk flytur]  |  Maks hoyde: 87m MSL  |  Maks hastighet: 15.2 m/s
```

**c) Fargegradient pa flyspor basert pa hoyde (kun ExpandedMapDialog)**
I stedet for en ensfarget gronn linje, tegne flysporet som segmenter med farge fra gronn (lav hoyde) til rod (hoy hoyde). Dette gir umiddelbar visuell forstaelse av hoydeprofilet.

### 4. Filer som endres

| Fil | Endring |
|-----|---------|
| `src/hooks/useFlightTimer.ts` | Utvid select og mapping i `fetchFlightTrack` |
| `src/components/dashboard/ExpandedMapDialog.tsx` | Nytt interface, klikkbare punkter, hoydefargegradient, statistikk-footer |
| `src/components/dashboard/MissionMapPreview.tsx` | Nytt interface, enkel hoydevisning ved klikk |

### 5. Bakoverkompatibilitet
Eksisterende flight_track-data som kun har `{ lat, lng, alt, timestamp }` vil fortsatt fungere. Det nye `alt`-feltet brukes som fallback nar `alt_msl` mangler. Nye flyturer far automatisk med all tilgjengelig data.
