

## Plan: Lagre dronevær-snapshot ved alle fullføringspunkter

### Problem
Vær-snapshot lagres kun når status endres til "Fullført" via redigeringsdialogen (`AddMissionDialog`). Men det finnes to andre steder der oppdrag settes til "Fullført" uten å lagre vær:

1. **MissionStatusDropdown** — dropdown på oppdragskortet (brukes oftest)
2. **auto-complete-missions** edge function — automatisk fullføring

Når snapshot mangler, faller `MissionCard` og `MissionDetailDialog` tilbake til å hente live vær fordi `weather_data_snapshot` er `null`.

### Løsning

#### Steg 1: MissionStatusDropdown — hent og lagre vær ved fullføring
**Fil: `src/components/dashboard/MissionStatusDropdown.tsx`**

- Legg til `latitude` og `longitude` som props (allerede tilgjengelig fra mission-objektet i MissionCard)
- Når `newStatus === "Fullført"` og `currentStatus !== "Fullført"`: kall `drone-weather` edge function med lat/lng, bygg snapshot-objektet, og inkluder `weather_data_snapshot` i update-queryen
- Oppdater MissionCard til å sende lat/lng til dropdown

#### Steg 2: MissionCard — send koordinater til dropdown
**Fil: `src/components/oppdrag/MissionCard.tsx`**

Pass `latitude` og `longitude` fra mission til `MissionStatusDropdown`.

#### Steg 3: auto-complete-missions — lagre vær ved automatisk fullføring
**Fil: `supabase/functions/auto-complete-missions/index.ts`**

Når funksjonen setter et oppdrag til "Fullført", hent værdata via drone-weather-endpunktet (intern kall) og lagre snapshot. Fallback: sett `weather_data_snapshot` til et minimalt objekt med `captured_at` og en note om at data var utilgjengelig.

### Filer som endres
- `src/components/dashboard/MissionStatusDropdown.tsx` — hent vær + lagre snapshot
- `src/components/oppdrag/MissionCard.tsx` — send lat/lng til dropdown
- `supabase/functions/auto-complete-missions/index.ts` — lagre vær ved auto-fullføring

