

## Plan: Fiks feil kolonnenavn i kalender-feed for equipment

### Funn
Etter å ha sjekket alle tabellene mot databaseskjemaet:

| Tabell | Brukt i koden | Faktisk kolonne | Status |
|--------|--------------|-----------------|--------|
| `calendar_events` | `updated_at` | `updated_at` | ✅ OK |
| `missions` | `oppdatert_dato` | `oppdatert_dato` | ✅ OK (nylig fikset) |
| `documents` | `oppdatert_dato` | `oppdatert_dato` | ✅ OK |
| `drones` | `oppdatert_dato` | `oppdatert_dato` | ✅ OK |
| `equipment` | `updated_at` | `oppdatert_dato` | ❌ FEIL |
| `drone_accessories` | `updated_at` | `updated_at` | ✅ OK |

**Equipment-tabellen** bruker `updated_at` i spørringen (linje 293), men kolonnen heter `oppdatert_dato`. Samme type feil som missions hadde — spørringen feiler stille og equipment-vedlikehold vises ikke i kalenderen.

### Endring — `supabase/functions/calendar-feed/index.ts`

**Linje 293** — endre select:
```
"id, navn, neste_vedlikehold, updated_at"
→
"id, navn, neste_vedlikehold, oppdatert_dato"
```

**Linje 307** — endre referanse:
```
eq.updated_at → eq.oppdatert_dato
```

### Filer
- `supabase/functions/calendar-feed/index.ts` (2 linjer)

