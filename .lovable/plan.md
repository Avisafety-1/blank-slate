

## Analyse: Batteridata lagres bare per flylogg, ikke på ressurskortene

### Nåværende situasjon

| Data | Lagres i `flight_logs` | Lagres på `equipment` (batterikortet) |
|------|----------------------|--------------------------------------|
| Sykluser (`battery_cycles`) | Ja, per logg | Nei |
| Helse (`battery_health_pct`) | Ja, per logg | Nei |
| Serienummer (`battery_sn`) | Ja, per logg | Ja (`serienummer`) |
| Temperatur min/maks | Ja, per logg | Nei |
| Kapasitet (full/current) | Nei (bare i edge function) | Nei |
| Celleavvik | Ja (via warnings) | Nei |

Batterier er lagret som `equipment` med `type = 'Batteri'`, men tabellen har kun generiske felter (navn, serienummer, vedlikehold, flyvetimer). Ingen batterspesifikke kolonner.

**Konsekvens:** Etter loggimport kan man se sykluser i den enkelte flyloggen, men batterikortet på Ressurser-siden viser aldri denne informasjonen. Man kan ikke se "dette batteriet har 142 sykluser og 87% helse" uten å grave i loggene.

### Plan

#### 1. Legg til batterspesifikke kolonner på `equipment`-tabellen

Ny migrasjon:
```sql
ALTER TABLE equipment
  ADD COLUMN battery_cycles integer,
  ADD COLUMN battery_health_pct numeric,
  ADD COLUMN battery_full_capacity_mah integer,
  ADD COLUMN battery_max_cell_deviation_v numeric;
```

#### 2. Oppdater equipment automatisk etter loggimport

I `UploadDroneLogDialog.tsx` sin `saveFlightLog`-funksjon, etter at loggen er lagret og batteriet er matchet: oppdater det matchede equipment-kortet med siste verdier fra loggen (sykluser, helse, kapasitet, maks celleavvik) — men bare hvis verdien er nyere/høyere.

#### 3. Vis batteriinfo på EquipmentDetailDialog

For equipment med `type = 'Batteri'`: vis en dedikert seksjon med sykluser, helse-%, kapasitet og maks celleavvik. Fargekod helse (grønn > 80%, gul 60-80%, rød < 60%) og sykluser (varsel ved høye tall).

#### 4. Vis aggregert batteriinfo i EquipmentLogbookDialog

Vis en trend/historikk over sykluser og helse fra `flight_logs` der `battery_sn` matcher utstyrets serienummer — så man kan se degraderingen over tid.

### Filer som endres

- **Ny migrasjon** — `ALTER TABLE equipment ADD COLUMN ...`
- **`src/integrations/supabase/types.ts`** — regenereres
- **`src/components/UploadDroneLogDialog.tsx`** — oppdater equipment etter save
- **`src/components/resources/EquipmentDetailDialog.tsx`** — vis batteridata
- **`src/components/resources/EquipmentLogbookDialog.tsx`** — vis historikk fra flight_logs

