

## Plan: Synkroniser vedlikeholdsvarsel med statusovergang grønn → gul

### Problem
I dag sender `check-maintenance-expiry` e-post basert på brukerens `inspection_reminder_days`-innstilling, som er uavhengig av statusberegningen. Brukeren ønsker at varselet sendes nøyaktig når dronen skifter fra grønn til gul status — altså når `varsel_dager`, `varsel_timer` eller `varsel_oppdrag` trigges.

### Løsning

**1. Ny kolonne på `drones`-tabellen**
- `maintenance_notification_sent BOOLEAN DEFAULT false` — flagg som indikerer at varsel allerede er sendt for nåværende vedlikeholdsperiode
- Tilbakestilles til `false` når inspeksjon utføres (i `performDroneInspection`)

**2. Oppdater `check-maintenance-expiry` edge-funksjonen**
- Hent alle aktive droner med utvidet select: `varsel_dager, varsel_timer, varsel_oppdrag, inspection_interval_hours, inspection_interval_missions, hours_at_last_inspection, flyvetimer, missions_at_last_inspection, maintenance_notification_sent`
- For hver drone: beregn status med samme logikk som `calculateDroneInspectionStatus` (dato, timer, oppdrag)
- For oppdragsbasert status: hent `flight_logs` og tell unike `mission_id` siden siste inspeksjon
- Kun send varsel hvis:
  - Kalkulert status er "Gul" eller "Rød" **OG**
  - `maintenance_notification_sent` er `false`
- Etter sending: sett `maintenance_notification_sent = true` på dronen
- Fjern den gamle `inspection_reminder_days`-baserte logikken for droner

**3. Oppdater `performDroneInspection` i `src/lib/droneInspection.ts`**
- Legg til `maintenance_notification_sent: false` i update-kallet, slik at flagget nullstilles etter inspeksjon

### Filer som endres
- Ny migrasjon (1 SQL-fil) — ny kolonne `maintenance_notification_sent`
- `supabase/functions/check-maintenance-expiry/index.ts` — ny statusberegningslogikk
- `src/lib/droneInspection.ts` — tilbakestill flagg ved inspeksjon

