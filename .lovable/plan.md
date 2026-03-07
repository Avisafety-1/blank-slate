

## Buggfix: Oppdragstelling nullstilles ikke etter inspeksjon

### Problem
Når «Utfør inspeksjon» kjøres, skjer to feil:

1. **`>=`-operator**: Flylogs telles med `flight_date >= sist_inspeksjon`. Etter inspeksjon settes `sist_inspeksjon` til **i dag**, men flights logget **i dag** telles fortsatt med pga `>=`. Bør bruke `>` (strictly after).

2. **Lokalt state oppdateres ikke**: Etter inspeksjonen kalles `onDroneUpdated()` (som refetcher dronen), men `fetchMissionsSinceInspection()` kjøres kun i `useEffect` basert på `drone`-prop. Selv om dronen refetches, kan rekkefølgen gjøre at den lokale `missionsSinceInspection`-staten viser gammel verdi.

3. **`missions_at_last_inspection` brukes aldri**: Feltet skrives til i DB men leses aldri — oppdragstellingen er 100% basert på flight_logs-query. Feltet er dermed overflødig men ufarlig.

### Løsning

#### 1. Endre `>=` til `>` i begge steder
- `DroneDetailDialog.tsx` linje 197: `.gte(...)` → `.gt(...)`
- `useStatusData.ts` linje 53: `.gte(...)` → `.gt(...)`

Dette sikrer at flights logget **på** inspeksjonsdatoen ikke telles som «etter inspeksjon».

#### 2. Re-fetch missions etter inspeksjon
I inspeksjons-handleren (linje 766), kall `fetchMissionsSinceInspection()` etter `onDroneUpdated()` for å oppdatere lokalt state umiddelbart. Alternativt sett `setMissionsSinceInspection(0)` optimistisk etter vellykket inspeksjon.

#### 3. Samme fix i sjekkliste-inspeksjon
Sjekk den andre inspeksjons-handleren (linje ~1500) for samme problem.

### Berørte filer
- `src/components/resources/DroneDetailDialog.tsx`
- `src/hooks/useStatusData.ts`

