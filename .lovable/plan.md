

## Problem

OpenAIP klassifiserer CTR-soner som zone_type `R` (Restricted) i databasen. Eksempel: «Ørland CTR» har `zone_type = 'R'`. Dette gjør at `check_mission_airspace`-funksjonen gir dem `WARNING` (rød) i stedet for `INFO` (blå).

**19 CTR-soner** er lagret som `R`, mens **35 TIZ-soner** er korrekt lagret som `TIZ`.

## Løsning — To-stegs fix

### 1. Oppdater eksisterende data

Kjør en UPDATE for å reklassifisere de 19 CTR-sonene fra `R` til `CTR`:

```sql
UPDATE aip_restriction_zones
SET zone_type = 'CTR'
WHERE zone_type = 'R' AND name ILIKE '%CTR%';
```

### 2. Oppdater synkroniseringslogikken

I `supabase/functions/sync-openaip-airspaces/index.ts`, legg til logikk som sjekker om sonenavnet inneholder «CTR» og overstyrer zone_type til `CTR` ved upsert — slik at fremtidige synkroniseringer ikke reverserer endringen.

### Filer som endres

| Fil | Endring |
|---|---|
| Data-oppdatering (INSERT-tool) | Reklassifiser 19 CTR-soner fra `R` til `CTR` |
| `supabase/functions/sync-openaip-airspaces/index.ts` | Override zone_type for CTR-navngitte soner |

