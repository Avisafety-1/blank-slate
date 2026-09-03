# Egendefinerte vedlikehold med i risikovurderingen

I dag beregner AI-risikovurderingen (og re-vurderingen, som bruker samme funksjon) ressursstatus kun ut fra standard vedlikehold: inspeksjonsdato, timer siden inspeksjon og oppdrag siden inspeksjon — pluss tilbehør og koblet utstyr. Egendefinerte vedlikehold (tabellen `maintenance_schedules`), som allerede påvirker status på ressurskortet og dashbord-KPI-en, blir ikke lest. En drone som er rød på grunn av et egendefinert intervall kan derfor fremstå som grønn for AI-en.

## Hva som endres

- Risikovurdering og re-vurdering leser alle egendefinerte vedlikehold for primærdronen, alle tildelte droner og alt tildelt utstyr.
- Statusen som sendes til AI-en blir det verste av: standard vedlikehold, egendefinerte vedlikehold, tilbehør, koblet utstyr og lagret status i databasen.
- Årsakslisten AI-en får inkluderer navnet på det egendefinerte vedlikeholdet og hva som utløste gul/rød (dato, timer eller oppdrag), f.eks. "Propellbytte: forfalt 12.08.2026 → Rød".
- Ingen databaseendringer og ingen endringer i eksisterende statusregler — kun ekstra kilde til status.

## Teknisk

- Ny fil `supabase/functions/ai-risk-assessment/customSchedules.ts`: Deno-port av statusberegningen i `src/lib/maintenanceSchedules.ts` (`calculateScheduleProgress`) — dato via `calculateMaintenanceStatus`, timer via `flyvetimer - hours_at_last` mot `interval_hours`/`warn_hours`, oppdrag via unike oppdrag siden `missions_at_last` mot `interval_missions`/`warn_missions`. Holdes i synk manuelt, på samme måte som `maintenanceStatus.ts` allerede gjør.
- Én batch-spørring mot `maintenance_schedules` med `drone_id in (...)` / `equipment_id in (...)` før statusberegningen, slik at vi ikke får N+1-kall per ressurs. Oppdragstellinger hentes kun for planer som faktisk bruker oppdragsintervall (`flight_logs` for droner, `mission_equipment` for utstyr).
- `computeDroneStatus` og `computeEquipmentStatus` i `supabase/functions/ai-risk-assessment/index.ts` utvides til å slå sammen den egendefinerte statusen med eksisterende resultat via `worstStatus`, og legge årsakene inn i `ownReasons`/`reasons` som allerede går videre til prompten.
- Feiler spørringen mot `maintenance_schedules`, logges det og vurderingen fortsetter med dagens oppførsel (ingen hard feil).
