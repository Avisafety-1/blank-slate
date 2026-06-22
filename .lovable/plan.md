## Plan: lenke + trygg fallback-sletting + eier-verifisering før sletting

### Steg 1: Skjemaendring (migrasjon)

```sql
ALTER TABLE public.personnel_log_entries
  ADD COLUMN IF NOT EXISTS flight_log_id UUID NULL
    REFERENCES public.flight_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personnel_log_entries_flight_log_id_idx
  ON public.personnel_log_entries(flight_log_id);
```

Idempotent. `ON DELETE SET NULL` hindrer kaskadetap.

### Steg 2: `FlightLogbookDialog.tsx` — nye innlegg lenkes direkte

- `handleAddManualHours`: sett `flight_log_id: newLog.id` på `personnel_log_entries.insert`.
- `fetchPersonnelLogs`: hent også `flight_log_id` og `entry_date`.
- `PersonnelLogEntry`-interface: legg til `flight_log_id?: string | null`.

### Steg 3: `handleDeleteEntry(entry)` — trygg logikk

```text
hvis entry.flight_log_id finnes:
    // Eier-verifisering — bekreft at flight_log faktisk tilhører denne personen
    SELECT fl.id
    FROM flight_logs fl
    JOIN flight_log_personnel flp ON flp.flight_log_id = fl.id
    WHERE fl.id = entry.flight_log_id
      AND flp.profile_id = personId
      AND fl.entry_source = 'manual';

    hvis ikke nøyaktig ett treff:
        toast "Kunne ikke entydig identifisere tilhørende flytur. Slett eller kontroller flyturen manuelt fra Flyturer-fanen."
        ABORT — ingenting slettes

    slett flight_log_personnel der flight_log_id = entry.flight_log_id
    slett flight_logs der id = entry.flight_log_id   // trigger trekker timer
    slett personnel_log_entries der id = entry.id
    toast suksess

ellers hvis entry.entry_type = 'flytid' og title starter med 'Manuelt lagt til':
    parse varighet fra title (regex: 'X t Y min' | 'X t' | 'Y min')
    hvis parsing feiler:
        toast "Kunne ikke entydig identifisere tilhørende flytur. Slett eller kontroller flyturen manuelt fra Flyturer-fanen."
        ABORT

    SELECT fl.id
    FROM flight_logs fl
    JOIN flight_log_personnel flp ON flp.flight_log_id = fl.id
    WHERE flp.profile_id = personId
      AND fl.entry_source = 'manual'
      AND fl.flight_date::date = entry.entry_date
      AND fl.flight_duration_minutes = parsedMinutes
      AND NOT EXISTS (
        SELECT 1 FROM personnel_log_entries ple
        WHERE ple.flight_log_id = fl.id
      );

    hvis nøyaktig én match:
        slett flight_log_personnel + flight_logs (matchet id) + personnel_log_entries (entry.id)
        toast suksess
    ellers (0 eller ≥2):
        toast "Kunne ikke entydig identifisere tilhørende flytur. Slett eller kontroller flyturen manuelt fra Flyturer-fanen."
        ABORT — ingenting slettes

ellers (vanlig logginnlegg uten flytid):
    slett kun personnel_log_entries (dagens oppførsel)
    toast suksess
```

Refresh ved suksess: `fetchFlightLogs()` + `fetchProfileData()` + `fetchPersonnelLogs()`, invalidér `profiles`-cache.

### Edge cases

| Tilfelle | Oppførsel |
|---|---|
| Nytt manuelt innlegg, riktig lenket | Eier-sjekk passerer → trygg sletting |
| Lenket flight_log som ikke tilhører personen (datafeil/manipulasjon) | Eier-sjekk avbryter, toast |
| Lenket flight_log slettet via annen vei | `flight_log_id` blir NULL via SET NULL → fall til fallback-gren |
| Eldre entydig (én manuell flylogg samme dag + varighet, ulenket) | Fallback finner og sletter begge |
| Eldre tvetydig (≥2 kandidater) | Avbryter, toast |
| Eldre uten matchende flylogg | Avbryter, toast |
| Vanlig notat-innlegg | Slettes som før |

### Verifisering

1. Legg til 1 t manuelt → ny rad har `flight_log_id`. Slett → totalt og "Manuelt lagt til" reduseres, raden borte fra "Flyturer".
2. Eldre Gard-rad (10 t) entydig → slettes korrekt via fallback.
3. To eldre 10 t-rader samme dag → sletting blokkeres, toast vises.
4. Manuelt manipulert `flight_log_id` som peker til annens flylogg → eier-sjekk blokkerer.

## Hva som IKKE endres
- `entry_source`, total/manuell-splitting, PDF.
- DB-triggere for `profiles.flyvetimer`.
- Vanlige (ikke-flytid) logginnlegg.
