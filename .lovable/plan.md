
# 3D Hoydeprofil og AGL-beregning for flyspor

## Oversikt
Legge til en hoydeprofil-visning (sidevisning) under kartet som viser flyturens hoyde over terrenget langs ruten. Terrenghoyden hentes fra Open-Meteo Elevation API (gratis, ingen noekkel nodvendig), og AGL (Above Ground Level) beregnes som MSL minus terrenghode. AGL vises ogsaa i telemetri-popupen naar man klikker paa flyruten.

## Tilnaerming

### Hvorfor hoydeprofil i stedet for full 3D?
En 2D hoydeprofil-graf (avstand langs ruten vs. hoyde) gir bedre lesbarhet enn et 3D-kart, krever ingen tunge biblioteker (bruker Recharts som allerede er installert), og viser tydelig forholdet mellom flyhoyde og terreng.

### Terrenghoydedata
Open-Meteo Elevation API (`https://api.open-meteo.com/v1/elevation?latitude=X,Y,Z&longitude=X,Y,Z`) aksepterer opptil 100 koordinater per kall og returnerer terrenghoyden for hvert punkt. For lengre spor deles posisjonene opp i batches.

## Endringer

### 1. Ny komponent: `FlightAltitudeProfile.tsx`
En Recharts-basert hoydeprofil som viser:
- **Blaa linje**: Flyhoyde (MSL)
- **Brun/gronn fylt omraade**: Terrengnivaa
- **X-akse**: Avstand langs ruten (km)
- **Y-akse**: Hoyde (meter)
- Hover/klikk paa grafen viser AGL, MSL, terrenghode og hastighet for det punktet
- Visuelt tydelig avstand mellom flytur og terreng (dette er AGL)

### 2. Oppdater `ExpandedMapDialog.tsx`
- Legg til en toggelknapp (fanevalg) mellom "Kart" og "Hoydeprofil" under kartet
- Naar hoydeprofil-fanen er valgt, vis `FlightAltitudeProfile` i stedet for (eller under) kartet
- Hent terrenghoydedata fra Open-Meteo Elevation API ved aapning
- Vis maks AGL og gjennomsnittlig AGL i statistikk-feltet nederst

### 3. Oppdater telemetri-popup i begge kartkomponenter
- Legg til "Hoyde (AGL)" i popup-innholdet naar terrenghoydedata er tilgjengelig
- Format: `Hoyde (AGL): XX m` i tillegg til eksisterende MSL-verdi

### 4. Oppdater `MissionMapPreview.tsx`
- Samme AGL-visning i popup naar terrenghoydedata er tilgjengelig

## Tekniske detaljer

### Open-Meteo Elevation API
```text
GET https://api.open-meteo.com/v1/elevation?latitude=61.0,61.1&longitude=11.0,11.1
Response: { "elevation": [250.5, 310.2] }
```
- Gratis, ingen API-noekkel
- Maks 100 punkter per kall, batches for lengre spor
- Opplosning: ~90m (SRTM-data)

### AGL-beregning
```text
AGL = alt_msl - terrain_elevation
```

### FlightAltitudeProfile-komponent (Recharts)
- AreaChart med to datasett: flyhoyde (MSL) og terreng
- Terreng som fylt omraade (brun/gronn) med flyhoyde som linje over
- Mellomrommet mellom linjene representerer AGL visuelt
- Tooltip viser MSL, AGL, terrenghode, hastighet og tid
- Responsiv bredde, fast hoyde (~200px)

### Dataflyt
```text
1. Dialog aapnes med flightTracks
2. Samle alle lat/lng fra track.positions
3. Batch-kall til Open-Meteo Elevation API
4. Beregn kumulativ avstand langs ruten (Haversine)
5. Kombiner: { distance, alt_msl, terrain_elevation, agl, speed, timestamp }
6. Vis i Recharts AreaChart
```

### Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| `src/components/dashboard/FlightAltitudeProfile.tsx` | **Ny** - Recharts hoydeprofil-komponent |
| `src/components/dashboard/ExpandedMapDialog.tsx` | Legg til profilvisning, terrenghoydedata-henting, AGL i popup |
| `src/components/dashboard/MissionMapPreview.tsx` | AGL i popup naar data er tilgjengelig |
