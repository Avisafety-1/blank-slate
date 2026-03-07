

## Plan: Utvidet inspeksjonsintervall med flytimer og oppdrag

### Oversikt
Utvide inspeksjonsintervallet for droner slik at vedlikeholdsstatus (Grønn/Gul/Rød) trigges av det som kommer **først** av tre kriterier:
1. **Dager** (eksisterende) — neste_inspeksjon dato
2. **Flytimer** — akkumulerte flytimer siden sist vedlikehold
3. **Antall oppdrag** — antall fullførte oppdrag (med flylogg) siden sist vedlikehold

### 1. Databasemigrasjon
Nye kolonner på `drones`-tabellen:
```sql
ALTER TABLE public.drones
  ADD COLUMN inspection_interval_hours numeric NULL,
  ADD COLUMN inspection_interval_missions integer NULL,
  ADD COLUMN hours_at_last_inspection numeric DEFAULT 0,
  ADD COLUMN missions_at_last_inspection integer DEFAULT 0;
```

- `inspection_interval_hours`: Maks flytimer mellom inspeksjoner (f.eks. 50)
- `inspection_interval_missions`: Maks oppdrag mellom inspeksjoner (f.eks. 100)
- `hours_at_last_inspection`: Snapshot av `flyvetimer` ved sist utført inspeksjon (nullstilles/settes ved inspeksjon)
- `missions_at_last_inspection`: Snapshot av antall fullførte oppdrag ved sist inspeksjon

### 2. Beregning av status (`maintenanceStatus.ts`)
Ny funksjon `calculateDroneInspectionStatus()` som tar inn:
- `neste_inspeksjon`, `varsel_dager` (eksisterende datobasert)
- `flyvetimer`, `hours_at_last_inspection`, `inspection_interval_hours`
- `missions_since_inspection`, `inspection_interval_missions`

Returnerer **worst** av de tre kriteriene. For flytimer/oppdrag: Rød når grensen er nådd/overskredet, Gul når innenfor varselmargin (f.eks. 80% av intervall).

### 3. Oppdragstelling fra loggbok
Når dialogen åpnes, hent antall **unike** `mission_id` fra `flight_logs` der `drone_id` matcher og `flight_date >= sist_inspeksjon`. Dette gir antall oppdrag fløyet siden sist vedlikehold.

### 4. UI-endringer i `DroneDetailDialog.tsx`

**Redigeringsmodus** — utvid inspeksjonsintervall-seksjonen:
- Legg til felt «Flytimer mellom inspeksjoner» (`inspection_interval_hours`)
- Legg til felt «Oppdrag mellom inspeksjoner» (`inspection_interval_missions`)
- Beholde eksisterende dager/startdato/varsel

**Visningsmodus** — vis progresjon:
- «Flytimer siden sist inspeksjon: X / Y» med fargeindikator
- «Oppdrag siden sist inspeksjon: X / Y» med fargeindikator
- Status-badge reflekterer worst av alle tre

**Ved utført inspeksjon** — nullstill tellere:
- Sett `hours_at_last_inspection = flyvetimer`
- Sett `missions_at_last_inspection` = nåværende total (fra query)
- Oppdater `sist_inspeksjon` og `neste_inspeksjon` som før

### 5. `calculateDroneAggregatedStatus` oppdatering
Utvid `MaintenanceItem`-interfacet og `calculateDroneAggregatedStatus` til å inkludere de nye feltene, slik at ressurslisten og dashboard også reflekterer flytimer/oppdrag-basert status.

### Berørte filer
- Ny migrasjon (SQL)
- `src/lib/maintenanceStatus.ts`
- `src/components/resources/DroneDetailDialog.tsx`

