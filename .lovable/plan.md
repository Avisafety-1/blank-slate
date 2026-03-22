

## Plan: 3D Dronemodell erstatter Attitude Indicator

### Oversikt
Bytt ut den 2D gyro/attitude-indikatoren i flyanalysen med en interaktiv 3D-modell av DJI Matrice T300 som roterer i sanntid basert på pitch, roll og yaw fra telemetrien.

### Steg 1: Installer avhengigheter
- `three@>=0.133`
- `@react-three/fiber@^8.18` (v8 for React 18)
- `@react-three/drei@^9.122.0` (v9 for React 18)

### Steg 2: Kopier GLTF-modell til prosjektet
- Pakk ut zip-filen og kopier GLTF/GLB + tilhørende filer (bin, teksturer) til `public/models/dji_matrice_t300/`
- Plassering i `public/` slik at den lastes via URL uten bundling

### Steg 3: Ny komponent — `Drone3DViewer.tsx`
Erstatter `DroneAttitudeIndicator`. Bruker `@react-three/fiber` Canvas med:
- `useGLTF` fra drei for å laste modellen
- Rotasjon basert på pitch/roll/yaw props (konvertert til radianer)
- Ambient + directional light for god synlighet
- `OrbitControls` disabled (kun telemetri styrer rotasjonen)
- Semi-transparent bakgrunn som matcher nåværende glasskort-stil
- Heading-tekst under canvas (som nå)

Samme props-interface som `DroneAttitudeIndicator` for drop-in-erstatning.

### Steg 4: Oppdater `FlightAnalysisDialog.tsx`
- Importer `Drone3DViewer` i stedet for `DroneAttitudeIndicator`
- Beholde samme overlay-posisjon (top-right, fyller kartets høyde på desktop)
- Lazy-load med `React.lazy` + `Suspense` for å unngå at three.js blokkerer initial load

### Filer
- `package.json` — nye deps
- `public/models/dji_matrice_t300/` — GLTF-modell
- `src/components/dashboard/Drone3DViewer.tsx` — ny komponent
- `src/components/dashboard/FlightAnalysisDialog.tsx` — bytt import

