

## Fiks KMZ-generering til å matche DJI WPML-spesifikasjonen eksakt

### Analyse -- hva er feil

Sammenlignet vår genererte fil mot DJI sin offisielle spesifikasjon og eksempelfiler:

| Problem | Vår kode | DJI-krav |
|---|---|---|
| `createTime`/`updateTime` format | ISO-streng (`2024-...T...Z`) | Unix timestamp i millisekunder (`1637600807044`) |
| `wpml:globalRTHHeight` | **MANGLER** | **Påkrevd** i missionConfig |
| `waylines.wpml`: `useGlobal*` flagg | Inkludert per Placemark | **Skal IKKE være der** -- kun i template.kml |
| `waylines.wpml`: `distance`, `duration` | Inkludert | Ikke i spesifikasjonen |
| `template.kml`: `wpml:height` per Placemark | Mangler | I DJI-eksempelet |
| `template.kml`: `wpml:ellipsoidHeight` | Mangler | I DJI-eksempelet |
| `template.kml`: `wpml:gimbalPitchAngle` | Mangler | I DJI-eksempelet |
| Namespace-versjon | `1.0.6` | `1.0.2` i offisielle eksempler |

### Plan

**Fil: `src/lib/kmzExport.ts`**

1. **Timestamp-format**: Endre fra ISO-streng til Unix millisekunder (`Date.now()`)

2. **template.kml** -- oppdater til å matche DJI-eksempelet:
   - Namespace: `1.0.2` (ikke `1.0.6`)
   - Legg til `wpml:globalRTHHeight` i missionConfig (sett til takeOffHeight)
   - Per Placemark: legg til `wpml:ellipsoidHeight` (sett til 0), `wpml:height` (sett til flightHeight), `wpml:gimbalPitchAngle` (sett til 0)
   - Behold `useGlobal*`-flagg (disse hører hjemme her)

3. **waylines.wpml** -- oppdater til å matche DJI-eksempelet:
   - Namespace: `1.0.2`
   - Legg til `wpml:globalRTHHeight` i missionConfig
   - **Fjern** `useGlobal*`-flagg fra Placemarks (disse hører IKKE hjemme i waylines.wpml)
   - **Fjern** `wpml:distance` og `wpml:duration` fra Folder
   - Behold eksplisitte verdier per waypoint (`executeHeight`, `waypointSpeed`, `waypointHeadingParam`, `waypointTurnParam`)

### Filer som endres
1. `src/lib/kmzExport.ts` -- oppdater begge generatorfunksjonene

