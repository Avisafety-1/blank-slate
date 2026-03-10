

## Foreslått SORA-buffer: Bruk selskapets egne droner

### Korreksjon fra opprinnelig plan
Dronevalg i SORA-panelet skal hente fra **`drones`-tabellen** (selskapets egne droner, RLS-filtrert), ikke fra `drone_models`-katalogen. Katalogen brukes kun som oppslag for tekniske spesifikasjoner.

### Ny fil: `src/lib/soraBufferCalculator.ts`
Ren beregningsfunksjon — uendret fra forrige plan. Tar inn `DroneProfile` + `MissionParams`, returnerer foreslåtte bufferverdier med summary og warnings.

### Endring: `src/components/SoraSettingsPanel.tsx`

1. **Dronevalg** — Select som henter fra `drones`-tabellen (aktive droner i selskapet). Viser modellnavn + registreringsnummer.
2. Når en drone velges, slå opp `drone_models` via `ilike('name', drone.modell)` for å hente specs (MTOW, max_wind, endurance, sensor).
3. **Oppdragsparametere** — VLOS/BVLOS, containment-nivå, fallskjerm/FTS-switches, vind-overstyring.
4. **Beregningsresultat** — Info-boks med foreslåtte verdier + "Bruk foreslått buffer"-knapp.
5. Eksisterende slidere forblir tilgjengelige for manuell overstyring.

### Props-endring
Ingen endring i `SoraSettingsPanel` props — den trenger `companyId` fra `useAuth()` internt for å filtrere droner.

### Filer

| Fil | Handling |
|-----|----------|
| `src/lib/soraBufferCalculator.ts` | **Ny** |
| `src/components/SoraSettingsPanel.tsx` | **Utvides** |
| `src/types/map.ts` | Uendret |

Ingen DB-endringer.

