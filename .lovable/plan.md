

## Plan: Flyg dronemarkør øverst på kartet

### Problem
Når et oppdrag publiseres til SafeSky, vises dronen i `safeskyPane` (z-index 698). Den interne pilotposisjons-markøren har **ingen pane** spesifisert, så den havner i Leaflets standard `markerPane` (z-index 600) — under alle luftromslagene. Dette gjør at man ikke kan klikke på egen drone.

### Løsning
Én liten endring i `src/lib/mapDataFetchers.ts`:

1. Legg til `pane: 'safeskyPane'` (eller et nytt, enda høyere pane) på pilotposisjons-markøren slik at den alltid ligger øverst og er klikkbar.

Konkret: Endre markøren på linje ~712 fra:
```typescript
const marker = L.marker([flight.start_lat, flight.start_lng], { 
  icon: pilotIcon, 
  interactive: mode !== 'routePlanning' 
});
```
til:
```typescript
const marker = L.marker([flight.start_lat, flight.start_lng], { 
  icon: pilotIcon, 
  interactive: mode !== 'routePlanning',
  pane: 'safeskyPane'
});
```

Alternativt kan vi opprette et eget `liveFlightPane` med z-index 699 (over SafeSky men under popups) for å holde hierarkiet rent. Da vises egne droner alltid over SafeSky-trafikk.

### Anbefaling
Eget pane `liveFlightPane` med z-index 699. Fordel: egne droner skiller seg visuelt fra ekstern trafikk og er alltid klikkbare.

### Berørte filer
- `src/components/OpenAIPMap.tsx` — opprett `liveFlightPane` med z-index 699 i `paneConfig`
- `src/lib/mapDataFetchers.ts` — sett `pane: 'liveFlightPane'` på pilotmarkørene (~linje 712)

### Omfang
Svært liten endring — 2 linjer i 2 filer.

