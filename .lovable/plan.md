

## Problem

Banneret forsvinner ikke etter klikk fordi:

1. `performReload()` tømmer cacher og gjør `window.location.reload()`
2. Etter reload kjører `handleOnline`/mount-sjekken på nytt
3. Den sammenligner hardkodet `LOCAL_APP_VERSION = '1'` mot DB-verdien (som admin har bumpa til '2')
4. Mismatch → banneret vises igjen i en uendelig loop

### Løsning

Erstatt hardkodet `LOCAL_APP_VERSION` med en localStorage-basert "sist sett versjon":

- Ved oppstart: les `localStorage.getItem('avisafe_app_version')` som lokal referanse
- Ved versionssjekk: sammenlign DB-verdi mot localStorage-verdi (ikke hardkodet)
- I `performReload()`: lagre den nye versjonen i localStorage **før** reload, slik at etter reload matcher versjonene og banneret ikke vises igjen
- Broadcast-signalet må inkludere versjonen slik at klienten vet hva den oppdaterer til

### Fil som endres

| Fil | Endring |
|---|---|
| `src/hooks/useForceReload.ts` | Fjern `LOCAL_APP_VERSION`. Bruk localStorage `avisafe_app_version` som referanse. I `performReload` og broadcast-handler: hent/lagre ny versjon i localStorage før reload. |
| `src/pages/Admin.tsx` | Inkluder gjeldende `app_version`-verdi i broadcast-payload slik at klienter kan lagre den |

