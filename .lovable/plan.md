

## Oppdater tekst for «Live posisjon»-modus

Tre språknøkler oppdateres i begge språkfiler, og GPS-koordinat-visningen i StartFlightDialog erstattes med DroneTag-enhetsinfo (men beholder GPS-status for feilsøking).

### Endringer

**`src/i18n/locales/no.json`** (linje 107-129):
- `flightStartedLiveUav`: → `"Flytur startet med live DroneTag-posisjon!"`
- `safeskyLivePositionDesc`: → `"Viser droneposisjon fra DroneTag på kartet"`
- `safeskyLiveInfo`: → `"Posisjonsdata hentes fra din DroneTag-enhet og vises på kartet i sanntid."`

**`src/i18n/locales/en.json`** (linje 107-129):
- `flightStartedLiveUav`: → `"Flight started with live DroneTag position!"`
- `safeskyLivePositionDesc`: → `"Shows drone position from DroneTag on the map"`
- `safeskyLiveInfo`: → `"Position data is retrieved from your DroneTag device and displayed on the map in real time."`

**`src/components/StartFlightDialog.tsx`** (linje 1053-1056):
- Erstatt `✓ {pilotName} @ coords` med DroneTag-enhetsinfo: viser valgt enhetsnavn + GPS-status (✓ posisjon OK / innhenter posisjon)
- Beholder `gpsLoading` og `gpsError` visning da enhetens GPS fortsatt må fungere

