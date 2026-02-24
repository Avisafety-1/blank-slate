

# Fix: DroneLog-opplastet flyspor vises ikke på kartet

## Problem

Når du laster opp en DJI-flylogg via DroneLog, lagres `flight_track` som en flat array:
```text
[{lat, lng, alt, timestamp}, {lat, lng, alt, timestamp}, ...]
```

Men koden som leser og rendrer flyspor forventer formatet som brukes av `LogFlightTimeDialog` (manuell flylogg):
```text
{ positions: [{lat, lng, alt, timestamp}, ...] }
```

Derfor returnerer `log.flight_track?.positions?.length > 0` alltid `false` for DroneLog-importerte logger, og sporet vises aldri.

## Løsning

**Fil: `src/components/UploadDroneLogDialog.tsx`**

Endre lagringen av `flight_track` til å bruke samme format som resten av systemet -- wrappet i `{ positions: [...] }`:

- Linje 284-285 (matched log update): `flight_track: { positions: flightTrack }`
- Linje 321 (ny flylogg): `flight_track: { positions: flightTrack }`

To linjer endres, ingen andre filer påvirkes. Eksisterende logger som allerede er lagret som flat array vil fortsatt ikke vises, men alle nye opplastinger vil fungere korrekt.

## Teknisk detalj

`LogFlightTimeDialog.tsx` linje 725-726 viser det korrekte formatet:
```
const flightTrackData = flightTrack && flightTrack.length > 0
  ? { positions: flightTrack }
  : null;
```

DroneLog-dialogen må gjøre det samme.

