
# Stabil terrengdata-lasting i utvidet kart

## Problem
Terrengdata (hoydeprofil og AGL-beregning) vises ikke konsistent. Arsaken er en kombinasjon av:
- Kartet initialiseres to ganger nar dialogen apnes (mapKey endrer seg og utloser re-init)
- Nar flyspor-data ankommer asynkront, utloser dette bade terreng-henting OG kart-reinitialisering samtidig
- Ingen gjenforsok hvis Open-Meteo API feiler

## Losning

### 1. Fjern mapKey fra kart-initialiserings-effekten
`mapKey` ble brukt for a tvinge re-init, men forarsaket dobbel initialisering. I stedet ryddes kartet opp nar `open` gar til false, og opprettes pa nytt nar `open` gar til true - uten mapKey som mellomledd.

### 2. Fjern `flightTracks` fra kart-init-effektens avhengigheter
Flyspor-laget legges til kartet i en egen effekt som kjorer nar `flightTracks` endres, uten a odelegge hele kartet. Dette forhindrer at kart-reinitialisering og terreng-henting kolliderer.

### 3. Legg til retry-logikk for terreng-API
Hvis Open-Meteo feiler, forsok opptil 2 ganger med 2 sekunders pause. Legg ogsa til console.log for feilsoking.

### 4. Gjor terreng-effekten uavhengig av mapKey
Terreng-hentingen trenger bare `open` og `flightTracks` - den pavirkes ikke av kartets livssyklus.

## Tekniske detaljer

### Fil: `src/components/dashboard/ExpandedMapDialog.tsx`

**Endring A - Fjern mapKey-effekten og forenkle initialisering:**
- Fjern `const [mapKey, setMapKey] = useState(0)` og hele useEffect for mapKey (linje 112-127)
- Fjern `mapKey` fra map init-effektens deps (linje 534)
- Flytt opprydding av gammel kart til starten av init-effekten

**Endring B - Skill ut flyspor-rendering til egen effekt:**
- Flytt flyspor-tegning (linje 281-387) til en separat `useEffect` som avhenger av `[flightTracks, terrainData]`
- Kart-init-effekten tegner bare base layers, markorer og rute
- Nar flightTracks eller terrainData endres, fjernes og tegnes sporlaget pa nytt uten a odelegge kartet

**Endring C - Retry-logikk for terreng:**
- I terreng-effekten (linje 73-109): wrap `fetchTerrainElevations` i en retry-lokke (maks 2 forsok)
- Legg til `console.log` for a spore vellykket/mislykket henting

### Fil: `src/lib/terrainElevation.ts`

**Endring D - Retry per batch:**
- I `fetchTerrainElevations`: legg til et enkelt retry (1 ekstra forsok) per batch-request mot Open-Meteo
- Legg til kort delay (1s) for retry

## Resultat
- Kartet initialiseres kun en gang nar dialogen apnes
- Flyspor og terrengdata oppdateres uten a odelegge kartet
- Terreng-API-feil forsokes pa nytt automatisk
- Hoydeprofil og AGL vises stabilt
