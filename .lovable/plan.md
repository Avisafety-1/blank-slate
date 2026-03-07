

## Bug: Flytid legges til som minutter i stedet for timer

### Rotårsak
Databasetriggeren `trg_update_drone_hours` kaller fortsatt den gamle funksjonen `update_drone_flight_hours_on_log()` som legger til `flight_duration_minutes` direkte til `flyvetimer`-kolonnen uten å dele på 60:

```sql
-- BUGGY (aktiv trigger):
SET flyvetimer = flyvetimer + NEW.flight_duration_minutes  -- 45 min → +45 timer!
```

En fikset funksjon `update_drone_flight_hours()` (med `/ 60.0`) ble opprettet i en senere migrasjon, men triggeren ble aldri oppdatert til å bruke den. Derfor kjøres den gamle funksjonen fortsatt.

Samme problem gjelder `trg_update_equipment_hours` som kaller den gamle `update_equipment_flight_hours_on_log()`.

### Løsning

**Database-migrasjon:**
1. Drop begge gamle triggere
2. Opprett nye triggere som peker til de korrigerte funksjonene (`update_drone_flight_hours` og `update_equipment_flight_hours`)
3. Korriger MAVIC 2 sin `flyvetimer` ved å trekke fra feilaktig lagt til tid (rekalkuler fra flight_logs)

```sql
-- 1. Erstatt drone-trigger
DROP TRIGGER IF EXISTS trg_update_drone_hours ON flight_logs;
CREATE TRIGGER trg_update_drone_hours
  AFTER INSERT ON flight_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_drone_flight_hours();

-- 2. Erstatt equipment-trigger
DROP TRIGGER IF EXISTS trg_update_equipment_hours ON flight_log_equipment;
CREATE TRIGGER trg_update_equipment_hours
  AFTER INSERT ON flight_log_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_flight_hours();

-- 3. Rekalkuler alle drone-flyvetimer fra faktiske logger
UPDATE drones d
SET flyvetimer = COALESCE(sub.total, 0)
FROM (
  SELECT drone_id, SUM(flight_duration_minutes) / 60.0 AS total
  FROM flight_logs
  WHERE drone_id IS NOT NULL
  GROUP BY drone_id
) sub
WHERE d.id = sub.drone_id;

-- 4. Rekalkuler alle equipment-flyvetimer
UPDATE equipment e
SET flyvetimer = COALESCE(sub.total, 0)
FROM (
  SELECT fle.equipment_id, SUM(fl.flight_duration_minutes) / 60.0 AS total
  FROM flight_log_equipment fle
  JOIN flight_logs fl ON fl.id = fle.flight_log_id
  GROUP BY fle.equipment_id
) sub
WHERE e.id = sub.equipment_id;
```

**Ingen kodeendringer** -- problemet er kun i databasetriggerne.

### Berørte data
- Alle droner og utstyr med flylogger etter den originale trigger-migrasjonen har potensielt oppblåste `flyvetimer`-verdier
- Rekalkulering fra faktiske `flight_logs` sikrer korrekte verdier for alle ressurser

