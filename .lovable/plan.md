

## Fix: Redeploy og verifiser FH2 list-devices

### Rotårsak
Edge-funksjonen har sannsynligvis ikke blitt deployet etter de siste endringene med `flattenDjiDeviceList` og diagnostikk-koden. Loggene viser null `list-devices`-kall, noe som betyr enten at gammel kode kjører (uten diagnostikk-loggene), eller at kallet feiler stille.

### Plan

1. **Redeploy `flighthub2-proxy`**
   - Deploye den nåværende koden som allerede har korrekt flatten-logikk og diagnostikk

2. **Teste direkte via curl**
   - Etter deploy, kalle `list-devices` via `curl_edge_functions` med brukerens auth-token
   - Inspisere rå-responsen fra DJI (diagnostikk-feltene: `raw_body_preview`, `raw_list_sample`, `raw_list_length`)

3. **Basert på resultatet:**
   - Hvis DJI returnerer `code: 0, data.list: []` (tom liste): problemet er på DJI-siden (rettigheter/nøkkel)
   - Hvis DJI returnerer enheter men de filtreres bort: fikse mapping
   - Hvis funksjonen krasjer: fikse feil i koden

### Tekniske detaljer
- Fil: `supabase/functions/flighthub2-proxy/index.ts` (ingen kodeendring, kun deploy)
- Diagnostikk-koden er allerede på plass i koden -- den returnerer `raw_body_preview`, `raw_list_sample`, `raw_data_keys` etc.
- UI-et i `FH2DevicesSection.tsx` har allerede "Vis rå-data"-knapp som viser `debugData`

