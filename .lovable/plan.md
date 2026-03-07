

## Plan: Fjern auto-advancing av sync-dato, bruk dedup-sjekk i stedet

### Problem
Når `dji_sync_from_date` auto-avanseres til nyeste loggdato, vil logger som lastes opp til DJI Cloud flere dager etter flyturen bli filtrert bort og aldri dukke opp i AviSafe.

### Løsning
Fjern auto-advancing av `dji_sync_from_date`. La datoen stå fast som en **minimumsgrense** satt av superadmin — den definerer kun "ikke sync eldre enn dette". Deduplisering håndteres allerede av to mekanismer:

1. **`pending_dji_logs`-sjekk** (linje 434-441): Sjekker om `dji_log_id` allerede finnes for selskapet — skipper hvis ja
2. **SHA-256 dedup** (linje 449-461): Sjekker om loggens hash allerede finnes i `flight_logs` — markerer som "approved" hvis ja

Disse to sjekkene gjør at selv om alle 50 logger fra API-et evalueres hver gang, vil kun genuint nye logger lastes ned og behandles. Allerede synkede logger hoppes over på millisekunder (én DB-spørring per logg).

### Endring

**`supabase/functions/dji-auto-sync/index.ts`**
1. Fjern `newestLogDate`-variabelen og all tracking av den (linje 330, 421-425)
2. Fjern auto-advance-blokken som oppdaterer `dji_sync_from_date` (linje 540-547)
3. Behold `syncFromDate`-filteret (linje 413, 428-431) — superadmin-datoen fungerer fortsatt som en nedre grense

### Konsekvens
- `dji_sync_from_date` blir en statisk grense satt av superadmin, ikke en auto-advancing markør
- Hver sync-kjøring sjekker alle logger nyere enn grensen, men hopper over allerede behandlede via `pending_dji_logs`-oppslaget
- Logger som lastes opp til DJI Cloud sent vil fanges opp ved neste sync
- API-kostnad: 2 faste kall (login + list) + 1 DB-spørring per kjent logg (billig) + 2 API-kall per genuint ny logg

### Filer
1. `supabase/functions/dji-auto-sync/index.ts` — fjern auto-advance, behold dedup

