# Ladesykluser som vedlikeholdstrigger for batterier

I dag kan et vedlikehold utløses av dager, flytimer eller antall oppdrag. For batterier er det ladesykluser som er den reelle slitasjemåleren — og syklustallet leses allerede automatisk inn fra flyloggene (`equipment.battery_cycles`). Denne endringen gjør sykluser til en fullverdig intervall-trigger, på linje med timer og oppdrag.

## Slik blir det

- I vedlikeholdsdialogen (både standard vedlikehold og egendefinerte inspeksjoner) kommer to nye felt når ressursen er et batteri:
  - "Sykluser mellom vedlikehold" (f.eks. 200)
  - "Varsle X sykluser før"
- Feltene vises kun for batteri-utstyr, så andre ressurser ser samme skjema som i dag.
- Statusen på vedlikeholdet blir verste av dager / flytimer / oppdrag / sykluser, akkurat som i dag bare med sykluser i tillegg.
- Når vedlikeholdet kvitteres ut, nullstilles syklustelleren ved at dagens `battery_cycles` lagres som "sykluser ved siste vedlikehold". Forbruket vises som "X av 200 sykluser siden sist".
- På /vedlikehold får batterier en ekstra KPI-bar for sykluser, ved siden av flytimer/oppdrag/dager.
- E-postvarslene fra vedlikeholdsjobben utløses også av syklusgrensen, med syklustallet i teksten.
- Malene får syklusfelt, og katalogmalene for batteri fylles med syklusgrenser (f.eks. 200 sykluser standard, 400 for enterprise) i stedet for bare tid.

Eksisterende innstillinger er urørt: alle nye felt er tomme som standard, og et vedlikehold uten syklusgrense oppfører seg nøyaktig som i dag.

## Teknisk

Migrasjon (ingen endring i RLS eller tilganger):

- `maintenance_schedules`: `interval_cycles integer`, `warn_cycles integer`, `cycles_at_last integer` (alle nullbare).
- `maintenance_schedule_presets`: `interval_cycles integer`, `warn_cycles integer`.
- `equipment` (standard vedlikehold): `inspection_interval_cycles integer`, `varsel_sykluser integer`, `cycles_at_last_inspection integer`.
- Oppdatering av globale batteri-katalogmaler med syklusverdier.

Kode:

- `src/lib/maintenanceSchedules.ts`: utvid typene, ta `cyclesUsed` inn i `calculateScheduleProgress` via eksisterende `calculateUsageStatus`, og la `performSchedule` skrive `cycles_at_last`. `fetchScheduleStatusMap` henter `battery_cycles` for utstyr slik at batterikort og dashboard-KPI reflekterer syklusstatus.
- `src/components/resources/MaintenanceSchedulesSection.tsx`: syklusfelt i skjema og kortvisning, kun når `isBatteryType(equipment.type)`; mapping mot både `equipment`-kolonnene (standard) og `maintenance_schedules` (egendefinert).
- `src/pages/Vedlikehold.tsx`: syklus-KPI og syklusbasert status i utstyrsvisningen, samt nullstilling ved utkvittering.
- `supabase/functions/check-maintenance-expiry/index.ts`: sjekk syklusgrense for utstyr og egendefinerte planer.
- Alle nye tekster via `t()` med nøkler i både `no.json` og `en.json`.
