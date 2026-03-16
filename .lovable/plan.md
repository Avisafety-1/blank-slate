

# Duggpunktstemperatur i værdata og AI-risikovurdering

## Bakgrunn
MET Norway API har `dew_point_temperature` tilgjengelig, men kun i **`complete.json`**-endepunktet. Dagens edge function bruker `compact.json`. Vi må bytte til `complete` for å få tilgang til duggpunktet.

## Hvorfor duggpunkt er viktig for droner
- Når lufttemperaturen nærmer seg duggpunktet (differanse < 2-3°C), er det risiko for kondens på linser, sensorer og elektronikk
- Kondens kan føre til kortslutning og tap av visuell kontakt
- Ising på propeller ved temperatur nær 0°C kombinert med lav duggpunktdifferanse

## Endringer

### 1. Edge Function: `supabase/functions/drone-weather/index.ts`
- Bytt API-kall fra `compact` til `complete`: `locationforecast/2.0/complete`
- Les ut `dew_point_temperature` fra `instant.details`
- Legg til duggpunkt-advarsel i `evaluateWeatherConditions`:
  - **Warning**: differanse < 1°C — høy risiko for kondens
  - **Caution**: differanse < 3°C — fare for kondens
  - **Note**: differanse < 5°C — vær oppmerksom
- Inkluder `dew_point` i response-objektets `current`-felt og i `hourly_forecast`

### 2. Frontend: `src/components/DroneWeatherPanel.tsx`
- Legg til `dew_point` i WeatherData-interfacet
- Vis duggpunkt i værkortet (grid utvides fra 3 til 4 kolonner, eller 2x2 rad)
- Vis duggpunkt i timeprognose-popover

### 3. Frontend: `src/lib/mapWeatherPopup.ts`
- Vis duggpunkt i kart-popupen sammen med temp/vind/nedbør

### 4. AI-risikovurdering: `supabase/functions/ai-risk-assessment/index.ts`
- Værdata sendes allerede videre til AI-prompten — duggpunktet kommer automatisk med i `weatherData.current`
- AI-modellen vil bruke den nye datapunkten i sin vurdering uten prompt-endring

### Advarselsterskler for duggpunktdifferanse (temp - duggpunkt)
| Differanse | Nivå | Melding |
|-----------|------|---------|
| < 1°C | Warning | Svært høy risiko for kondens/dugg — ikke fly |
| < 3°C | Caution | Fare for kondens — vurder å utsette flygning |
| < 5°C | Note | Nær duggpunktet — vær oppmerksom på fuktighet |

