

## Problem

Luftromsadvarslene behandler CTR og TIZ feil:
- **CTR** gir `WARNING` (rød) — men det er lov å fly i CTR opp til 120m
- **TIZ** gir `CAUTION` — men samme regel gjelder
- Meldingsteksten er generisk ("Ruten går gjennom CTR-sone") uten å nevne 120m-begrensningen
- Nærhet til 5KM-sonen innenfor CTR/TIZ gir ikke kontekst om kontrollert luftrom

## Løsning

### 1. Database: Endre severity for CTR og TIZ (ny migration)

Flytt CTR fra `WARNING` til `CAUTION` og TIZ fra `CAUTION` til `INFO`:

```sql
CASE
  WHEN rc.cz_type IN ('P', 'R', 'NSM') THEN 'WARNING'
  WHEN rc.cz_type IN ('D', 'RMZ', 'TMZ', 'ATZ', '5KM') THEN 'CAUTION'
  WHEN rc.cz_type IN ('CTR', 'TIZ') THEN 'INFO'
  ELSE 'INFO'
END
```

CTR/TIZ blir nå blå info-varsler i stedet for røde/gule.

### 2. Frontend: Kontekstuelle meldinger i `AirspaceWarnings.tsx`

Erstatt den generiske meldingslogikken med spesifikke meldinger for CTR/TIZ:

- **Inne i CTR/TIZ**: `"I kontrollert luftrom (CTR «Gardermoen»). Maks høyde 120 meter AGL."`
- **Nær CTR/TIZ** (men utenfor): `"Nærhet til kontrollert luftrom (CTR «Gardermoen»), X m unna. Kontakt tårn ved høyere operasjoner."`
- **Nær 5KM-sone**: Beholder eksisterende CAUTION, men legger til: `"Nærhet til 5 km-sonen rundt «Gardermoen». Kontrollert luftrom — maks 120 m AGL."`

### Filer som endres

| Fil | Endring |
|---|---|
| Ny SQL-migration | Oppdater `check_mission_airspace` severity-mapping |
| `src/components/dashboard/AirspaceWarnings.tsx` | Kontekstuelle meldinger for CTR, TIZ og 5KM |

