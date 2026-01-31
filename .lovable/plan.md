

# Plan: Oppdater ECCAIRS Test Base-URL

## Endring

Endre standard test/sandbox base-URL for ECCAIRS fra:
- **Nåværende**: `https://api.intg-aviationreporting.eu`
- **Ny**: `https://api.uat.aviationreporting.eu`

## Teknisk endring

### Fil: `supabase/functions/_shared/eccairs-gateway-server.js`

**Linje 129-133** - Oppdater `getDefaultBaseUrl`-funksjonen:

```javascript
// Fra:
function getDefaultBaseUrl(environment) {
  return environment === 'prod'
    ? 'https://api.aviationreporting.eu'
    : 'https://api.intg-aviationreporting.eu';
}

// Til:
function getDefaultBaseUrl(environment) {
  return environment === 'prod'
    ? 'https://api.aviationreporting.eu'
    : 'https://api.uat.aviationreporting.eu';
}
```

## Påvirkning

| Miljø | URL |
|-------|-----|
| `prod` | `https://api.aviationreporting.eu` (uendret) |
| `sandbox` / test | `https://api.uat.aviationreporting.eu` (ny) |

Denne endringen påvirker alle ECCAIRS API-kall i testmiljøet, inkludert:
- Oppretting av hendelser
- Redigering av hendelser
- Sletting av hendelser
- Opplasting av vedlegg
- Tilkoblingstester

