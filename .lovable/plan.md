

## Plan: Skille NOTAM-pinner fra NOTAM-områder i z-index

### Problem
Akkurat nå legges både NOTAM-områder (sirkler/polygoner) og NOTAM-pinner (markers for aerodrome / center) i samme `notamPane` (z-index 640). Det betyr at pinnene havner under NSM, 5km RPAS og TMZ/TIZ — selv om områdene gjerne skal ligge der.

### Løsning
Lag en **ny pane `notamPinPane`** kun for marker-ikonene, plassert over alle luftromsflater men under oppdragspinner og live flight.

### Endringer

**1. `src/components/OpenAIPMap.tsx`** — `paneConfig` (rundt linje 396–400):
Legg til ny pane:
```ts
notamPinPane: '675',  // mellom obstacle (660) og missionPane (680)
```
Endelig rekkefølge (lav → høy):
`rmz(620) < aip(625) < rpas(630) < notam-områder(640) < nsm(650) < obstacle(660) < notamPinPane(675) < route(665) < airport(670) < mission(680) < liveFlight(720) < safesky(750)`.

Marker-pane (`notamPinPane`) trenger ikke være i `nonInteractivePanes`-settet siden pinner skal være klikkbare også i routePlanning bør forbli som NOTAM-områdene — vi holder samme oppførsel og legger den med i `panesToDisable`-listen + `nonInteractivePanes`.

**2. `src/components/OpenAIPMap.tsx`** — call til `fetchNotams` (linje 595):
Send med ekstra prop:
```ts
fetchNotams({ layer: notamLayer, pane: 'notamPane', pinPane: 'notamPinPane', mode });
```

**3. `src/lib/mapDataFetchers.ts`** — `fetchNotams`:
- Utvid signaturen med `pinPane: string`.
- Når et `geometry_geojson` rendres som GeoJSON og lager pin-markers (linje ~896–917), bruk `pane: pinPane` i stedet for `pane`.
- Når `addNotamCenterMarker` kalles, send med `pinPane`. Inne i funksjonen: marker (både `L.marker` og `L.circleMarker`) bruker `pinPane`.
- Områder/polygoner og fallback-`circleMarker` for ikke-aerodrome NOTAMs uten geometri vurderes som "område" og blir værende på `notamPane`. Aerodrome-pin og pointToLayer-pin går til `notamPinPane`.

### Filer som endres
- `src/components/OpenAIPMap.tsx` (paneConfig + ett funksjonskall)
- `src/lib/mapDataFetchers.ts` (`fetchNotams` + `addNotamCenterMarker`)

### Resultat
NOTAM-områder forblir under NSM/5km/TMZ/TIZ (uendret), mens NOTAM-pinnene nå tegnes oppå alle disse luftromsflatene og er fortsatt klikkbare. Oppdragspinner og SafeSky ligger fremdeles over NOTAM-pinnene.

