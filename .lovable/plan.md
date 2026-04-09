

## Oppdater KMZ-eksport med DJI-påkrevde felter + konfigurerbare parametre

### Hva som endres

**1. Legg til manglende påkrevde DJI WPML-felter i `src/lib/kmzExport.ts`**

Uten disse godtar ikke FlightHub 2 filen:
- `wpml:templateType` = `waypoint` (påkrevd, mangler helt)
- `wpml:takeOffSecurityHeight` i missionConfig
- `wpml:waylineCoordinateSysParam` med `coordinateMode`, `heightMode`, `positioningType`
- Per Placemark: `wpml:useGlobalHeight`, `wpml:useGlobalSpeed`, `wpml:useGlobalHeadingParam`, `wpml:useGlobalTurnParam`

**2. Gjør nøkkelparametere konfigurerbare via dialog**

Legg til innstillinger i `FlightHub2SendDialog.tsx`:

| Parameter | Default | Alternativer |
|---|---|---|
| Takeoff-sikkerhetshøyde | 20m | Tallinnput (1.2-1500m) |
| Høydemodus | Relativ til startpunkt | Dropdown: Relativ / EGM96 (havnivå) |
| Flyhastighet | 5 m/s | Tallinnput (1-15 m/s) |
| Svingmodus | Stopp i hvert punkt | Dropdown: Stopp / Fly gjennom |

Disse sendes videre til `generateDJIKMZ` som nye valgfrie parametre.

**3. Hardkodede (trygge) verdier**

Disse trenger IKKE å være konfigurerbare:
- `finishAction: goHome` -- drona flyr hjem etter siste punkt
- `exitOnRCLost: executeLostAction` + `executeRCLostAction: goBack` -- drona flyr hjem ved signaltap
- `flyToWaylineMode: safely` -- trygg rute til første waypoint
- `coordinateMode: WGS84` -- alltid WGS84
- `positioningType: GPS` -- standard GPS

### Teknisk

**`src/lib/kmzExport.ts`**: 
- Nytt options-interface med valgfrie felter (takeOffHeight, heightMode, speed, turnMode)
- Oppdater `generateTemplateKml` med alle påkrevde felter
- Oppdater `generateWaylinesWpml` tilsvarende

**`src/components/FlightHub2SendDialog.tsx`**:
- Legg til 4 nye inputs i dialogen (under "Navn på rute")
- Send verdiene til `generateDJIKMZ`

**`src/lib/oppdragKmzExport.ts`**:
- Oppdater kallet til `generateDJIKMZ` med det nye options-interfacet (bruker defaults)

### Filer som endres
1. `src/lib/kmzExport.ts` -- påkrevde WPML-felter + konfigurerbare parametre
2. `src/components/FlightHub2SendDialog.tsx` -- UI for parametre
3. `src/lib/oppdragKmzExport.ts` -- tilpass til nytt interface

