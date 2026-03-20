

## Plan: Sentrer drone og forstørr gyro i flyanalyse

### Endringer

**1. Større drone-ikon (`FlightAnalysisDialog.tsx`, linje 192-196)**
- Endre `iconSize` fra `[32, 32]` til `[48, 48]` og `iconAnchor` til `[24, 24]` — 50% større

**2. Offset panTo mot venstre 1/3 når gyro er aktiv (linje 211)**
- Når `positions[currentIndex]?.pitch !== undefined` (gyro synlig): bruk `map.panTo()` med en pixel-offset som plasserer drona på venstre 1/3 av kartbredden
- Beregn offset: `map.getSize().x / 6` piksler mot høyre (dvs. kartet panorerer slik at drona havner 1/3 fra venstre)
- Bruk `map.setView(map.containerPointToLatLng(targetPoint))` eller `panBy` etter panTo
- Når gyro IKKE er aktiv: standard `panTo` uten offset (sentrert)

**3. Større gyro-indikator (`DroneAttitudeIndicator.tsx`)**
- Endre ytre container fra `w-[72px] h-[72px]` til `w-[108px] h-[108px]` — 50% større
- Endre indre ball fra `w-[56px] h-[56px]` til `w-[84px] h-[84px]`
- Oppdater SVG `viewBox` og linje-koordinater proporsjonalt (skaler med 1.5x)
- Øk heading-tekst fra `text-[9px]` til `text-[11px]`

### Filer
- `src/components/dashboard/FlightAnalysisDialog.tsx` — drone-ikon 48px, offset panTo
- `src/components/dashboard/DroneAttitudeIndicator.tsx` — 50% større dimensjoner

