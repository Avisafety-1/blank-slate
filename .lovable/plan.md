## Mål
Fjerne den midlertidige hjelpefunksjonen `public.admin_trigger_edge_function(text, jsonb)` som ble brukt for å trigge edge-funksjoner manuelt via SQL.

## Hvorfor
Funksjonen er `SECURITY DEFINER`, gjør `net.http_post` med innebakt Authorization Bearer-token til edge-gateway, og har `GRANT EXECUTE ... TO PUBLIC`. Det betyr at enhver rolle (inkl. `anon`) i prinsippet kan kalle hvilken som helst edge-funksjon i prosjektet via SQL — det er en reell privilege-escalation/SSRF-risiko og bør ikke ligge igjen etter at sync er kjørt.

## Endring (én migrasjon)
```sql
REVOKE ALL ON FUNCTION public.admin_trigger_edge_function(text, jsonb) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.admin_trigger_edge_function(text, jsonb);
```

## Verifisering
- `pg_proc`-oppslag skal returnere 0 rader for `admin_trigger_edge_function` etterpå.
- Ingen app-kode refererer til funksjonen (kun brukt fra midlertidige DO-blokker i tidligere migrasjoner).

## Looping
Loggene viser at både `sync-caa-drone-zones` og `fetch-notams` faktisk har kjørt nylig (NOTAMs: upserted=235, caa_enriched=7). Så dataene er på plass — vi trenger ikke flere trigger-kall. Trygt å droppe helperen nå.