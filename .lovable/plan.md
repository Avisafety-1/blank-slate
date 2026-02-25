

# DroneLog API Usage-knapp i selskapsadministrasjon

## Oversikt

Legg til en "API-bruk"-knapp ved siden av "+ Nytt selskap" som henter DroneLog API-bruksdata via `GET /api/v1/usage` og viser det i en dialog.

## Tekniske endringer

### 1. Ny edge function: `dronelog-usage`

Oppretter `supabase/functions/dronelog-usage/index.ts` som:
- Validerer JWT og sjekker superadmin-rolle (samme mønster som `manage-dronelog-key`)
- Henter `DRONELOG_AVISAFE_KEY` fra secrets
- Kaller `GET https://dronelogapi.com/api/v1/usage` med master-key, videresender query-parametere (`from`, `to`)
- Returnerer responsen til frontend

Registrerer funksjonen i `supabase/config.toml` med `verify_jwt = false`.

### 2. Frontend: CompanyManagementSection.tsx

Legg til:
- En "API-bruk"-knapp (med `BarChart3`-ikon) ved siden av "+ Nytt selskap"-knappen
- State for `usageDialogOpen` og `usageData`
- En `handleFetchUsage`-funksjon som kaller `supabase.functions.invoke('dronelog-usage')` med gjeldende måned som `from`/`to`
- En enkel Dialog som viser API-bruksdata: antall brukte kall, limit, gjenstaaende, og eventuelt en liste over requests

## Filer som endres

| Fil | Endring |
|---|---|
| `supabase/functions/dronelog-usage/index.ts` | Ny edge function - proxy for DroneLog usage API |
| `supabase/config.toml` | Registrer `dronelog-usage` med `verify_jwt = false` |
| `src/components/admin/CompanyManagementSection.tsx` | Legg til API-bruk-knapp og dialog |

## Flyten

```text
Admin klikker "API-bruk"
  → Frontend kaller dronelog-usage({ from: "2026-02-01", to: "2026-02-28" })
  → Edge function: GET dronelogapi.com/api/v1/usage?from=2026-02-01&to=2026-02-28
  → Returnerer bruksdata til frontend
  → Dialog viser brukt/limit/gjenstaaende
```

