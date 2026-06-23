# Fix: AI-risikovurdering bruker utdatert dronestatus

## Problem
UI viser dronen som **Rød** fordi inspeksjonsdatoen er forfalt (30.05.2026 < dagens dato), men AI-risikovurderingen rapporterer **Grønn** og gir 9.0/10 GO. Årsaken er at edge-funksjonen sender den rå `drones.status`-kolonnen (som ikke oppdateres automatisk når datoer passerer), mens UI-et beregner status dynamisk fra inspeksjonsdato + flytimer + oppdrag + tilbehør + koblet utstyr.

## Løsning
Porter samme statuslogikk som `src/lib/maintenanceStatus.ts` bruker, inn i edge-funksjonen, og send den beregnede statusen til AI-prompten i stedet for den rå kolonnen.

### Filer som endres

**1. Ny: `supabase/functions/ai-risk-assessment/maintenanceStatus.ts`**
Deno-versjon av logikken (kopi fra `src/lib/maintenanceStatus.ts`):
- `calculateMaintenanceStatus(date, warningDays)`
- `calculateUsageStatus(usage, limit, warningMargin)`
- `calculateDroneInspectionStatus({...})`
- `calculateEquipmentMaintenanceStatus({...})`
- `calculateDroneAggregatedStatus(drone, accessories, linkedEquipment)`
- `worstStatus`, `STATUS_PRIORITY`

**2. `supabase/functions/ai-risk-assessment/index.ts`**
- For primærdronen: hent `drone_accessories` (eller tilsvarende tabell) og bruk allerede henta `assignedEquipment` for å kjøre `calculateDroneAggregatedStatus`. Erstatt `status: droneData.status` (linje 1518) med den beregnede aggregerte statusen, og legg ved `statusReason` / `affectedItems` så AI kan forklare hvorfor.
- For hvert element i `assignedEquipment` og `assignedDrones`: erstatt rå `status`-felt i payloaden med `calculateEquipmentMaintenanceStatus` / `calculateDroneInspectionStatus`-resultatet før det sendes til AI.
- Logg en advarsel hvis rå status og beregnet status avviker, så vi kan oppdage stale `drones.status`-kolonner.

**3. `supabase/functions/ai-risk-assessment/prompts.ts`**
Liten justering: gjør det eksplisitt i UTSTYR-seksjonen at `primaryDrone.status` allerede er den aggregerte beregnede statusen (forfalt inspeksjon → Rød), slik at AI ikke bortforklarer den med "siste inspeksjon ble nylig utført".

## Forventet resultat
Dersom `neste_inspeksjon` er passert, vil AI motta `primaryDrone.status = "Rød"` med begrunnelse "inspeksjon forfalt", utløse hard stop-regel #3 (UTSTYR Rød) og gi NO-GO på utstyrskategorien i stedet for 9.0/10 GO.

## Ikke endret
- Selve `drones.status`-kolonnen i databasen røres ikke (egen oppgave hvis ønsket).
- UI-logikken for status er allerede riktig og endres ikke.
