
## Fix: Kystvakten får ikke åpnet flylogg-opplasting

### Hva som faktisk feiler
Dette ser ikke ut til å være feil i selve `UploadDroneLogDialog`. Dialogen har allerede støtte for:
- kun DJI
- kun ArduPilot
- begge

Problemet ligger i dashboard-knappen på `Index.tsx`:

- `Index.tsx` viser dropdownen **kun når** `djiFlightlogEnabled` er `true`
- hvis `djiFlightlogEnabled` er `false`, vises bare knappen **"Logg flytid manuelt"**
- `Index.tsx` kjenner ikke til `ardupilot_enabled` i det hele tatt

Dermed:
- Kystvakten kan ha `ardupilot_enabled = true`
- men dashboardet tror fortsatt at det ikke finnes loggopplasting
- resultatet blir akkurat det du beskriver: bare manuell logging, ingen vei inn til opplastingsdialogen

### Løsning
Jeg vil gjøre opplastings-entrypointet på forsiden avhengig av **begge** loggkapabilitetene, ikke bare DJI.

## Endringer

### 1. Utvid `AuthContext` med ArduPilot-kapabilitet
**Fil:** `src/contexts/AuthContext.tsx`

Legg til `ardupilotFlightlogEnabled` i:
- `CachedProfile`
- `AuthContextType`
- default context value
- state