

## Send SORA-buffersoner med forskjellige farger til FlightHub 2

### Nåværende oppførsel
Kun én samlet buffersone (flight geography + contingency + ground risk) sendes som én annotasjon med én farge (`#FF6B35`).

### Ny oppførsel
Tre separate annotasjoner sendes, hver med egen farge:
- **Flight Geography** (innerst) — Blå (`#3B82F6`)
- **Contingency Volume** (midten) — Gul/oransje (`#F59E0B`)
- **Ground Risk Buffer** (ytterst) — Rød (`#EF4444`)

### Endringer

**1. `src/components/FlightHub2SendDialog.tsx`**

- Endre props: erstatt `soraBufferCoordinates` med tre separate koordinatsett, eller beregn dem internt basert på `soraSettings`-avstandene og rutekoordinatene
- Praktisk løsning: ta inn rutekoordinater + soraSettings, beregn tre buffersoner i dialogen med `bufferPolyline`/`bufferPolygon` fra `soraGeometry.ts`
- Oppdater `handleSend` til å sende tre separate `create-annotation`-kall:
  - `{routeName} – Flight Geography` med blå farge
  - `{routeName} – Contingency Volume` med gul farge  
  - `{routeName} – Ground Risk Buffer` med rød farge
- Hver GeoJSON feature får sin farge i `properties.color`
- Oppdater sjekkboks-teksten til å indikere at tre soner sendes

**2. `src/pages/Oppdrag.tsx`**

- Forenkle: i stedet for å beregne én samlet buffer, send rutekoordinater og soraSettings direkte til dialogen (dialogen beregner selv)
- Alternativt: beregn tre separate buffersoner her og pass dem som props

**3. `src/pages/Kart.tsx`**

- Samme tilpasning som Oppdrag.tsx — sørg for at soraSettings og rutedata sendes korrekt

### Teknisk detalj
Tre buffersoner beregnes med kumulative avstander:
```
flightGeo = bufferPolyline(coords, soraSettings.flightGeographyDistance)
contingency = bufferPolyline(coords, flightGeographyDistance + contingencyDistance)
groundRisk = bufferPolyline(coords, flightGeographyDistance + contingencyDistance + groundRiskDistance)
```

Fargene settes i GeoJSON `properties.color` som allerede støttes av edge-funksjonen (sendes videre til FH2 API).

