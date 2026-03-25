

## Plan: Vis eier og «Mine logger»-filter på ventende flylogger

### Problem
Alle ventende flylogger fra auto-sync vises i en felles liste uten å vise hvem som lastet dem opp. Brukeren ønsker å se eierens navn og kunne filtrere til kun sine egne logger.

### Løsning

**Fil: `src/components/PendingDjiLogsSection.tsx`**

1. **Hent brukernavn via join**: Endre select fra `"*"` til `"*, profiles!pending_dji_logs_user_id_fkey(full_name)"` (eller tilsvarende join mot profiles-tabellen) for å hente navnet på brukeren som eier loggen.

2. **Vis eierens navn**: Legg til brukerens navn i hver logg-rad, under dato/varighet-linjen, f.eks. `· Ola Nordmann`.

3. **«Mine logger»-toggle**: Legg til en Switch-komponent i headeren (ved siden av badge) med label «Kun mine». Filteret bruker `useAuth().user.id` til å sammenligne med `log.user_id`. Togglenstilstand lagres i komponentens state.

4. **Oppdater PendingDjiLog-interfacet**: Legg til `user_id` og profildata i typen.

### Ingen databaseendringer
Tabellen `pending_dji_logs` har allerede `user_id`-kolonnen. Det trengs kun en frontend-endring.

