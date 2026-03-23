

## Plan: Fiks missions i kalender-feed (kolonnenavn)

### Problem
Missions-spørringen på linje 226 i `calendar-feed/index.ts` ber om `updated_at`, men kolonnen heter `oppdatert_dato` i missions-tabellen. Supabase returnerer en feil som ignoreres, så `missions` blir `null` og ingen oppdrag vises.

### Endring er kun i kalender-feeden
Kolonnen `oppdatert_dato` er riktig kolonnenavn i missions-tabellen. Endringen er kun i `calendar-feed/index.ts` — ingen andre filer påvirkes.

### Endring — `supabase/functions/calendar-feed/index.ts`

**Linje 226** — endre select:
```
"id, tittel, beskrivelse, tidspunkt, slutt_tidspunkt, updated_at"
→
"id, tittel, beskrivelse, tidspunkt, slutt_tidspunkt, oppdatert_dato"
```

**Linje 241** — endre referanse i event-mapping:
```
mission.updated_at → mission.oppdatert_dato
```

### Filer
- `supabase/functions/calendar-feed/index.ts` (2 linjer)

