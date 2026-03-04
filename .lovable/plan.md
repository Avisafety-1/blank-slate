

## Problem: Offline brukere med gammel cache

Ja, dette er et reelt problem. Når en bruker er offline, serverer appen:

1. **Gamle app-filer** fra Service Worker-cachen (HTML, JS, CSS)
2. **Gammel data** fra React Query persistence (localStorage, 24t TTL)
3. **Gammel data** fra `offlineCache` (localStorage, 24t TTL)

Når de kommer tilbake online, oppdaterer Service Worker seg *asynkront i bakgrunnen* — men brukeren ser fortsatt gammel kode til neste reload. React Query-data forblir cachet til TTL utløper.

## Løsning: To-lags tilnærming

### 1. Superadmin "Tving oppdatering"-knapp (for online brukere)
- Supabase Realtime broadcast sender signal til alle tilkoblede klienter
- Klienten viser en **ikke-lukkbar banner**: "Ny versjon tilgjengelig — klikk for å oppdatere"
- Valgfri "Tving umiddelbart"-toggle for kritiske situasjoner

### 2. Automatisk cache-bust ved reconnect (for offline brukere)
- Når en bruker går fra offline → online, sjekk en enkel `app_version`-verdi i en Supabase-tabell mot en hardkodet versjon i koden
- Hvis versjonene ikke matcher: tøm cacher og vis reload-banner
- Dette fanger opp offline-brukere automatisk uten broadcast

### Filer som endres/opprettes

| Fil | Endring |
|---|---|
| `src/hooks/useForceReload.ts` | **Ny.** Lytter på broadcast + sjekker versjon ved reconnect. Tømmer SW-cache, React Query-cache, localStorage-cacher, og viser banner. |
| `src/components/ForceReloadBanner.tsx` | **Ny.** Ikke-lukkbar banner med "Oppdater nå"-knapp |
| `src/App.tsx` | Legg til `useForceReload` og `ForceReloadBanner` |
| `src/pages/Admin.tsx` | Legg til "Tving oppdatering"-knapp i superadmin-seksjonen |
| **DB-migrasjon** | Ny tabell `app_config` med én rad (`key: 'app_version', value: '...'`) — superadmin oppdaterer denne |

### Flyt

```text
ONLINE BRUKERE:
  Admin klikker "Tving oppdatering"
    → Broadcast signal sendes
    → Banner vises: "Ny versjon — klikk for å oppdatere"
    → Bruker klikker → cacher tømmes → reload

OFFLINE BRUKERE:
  Bruker kommer online igjen
    → Hook sjekker app_config.app_version mot lokal versjon
    → Mismatch → Banner vises → Bruker klikker → reload
```

### Sikkerhet
- Ingen data går tapt: offline-køen (`offlineQueue`) synkroniseres **før** reload
- Brukeren velger selv når de oppdaterer (med mindre admin tvinger umiddelbart)
- Kun AviSafe påvirkes — broadcast er app-spesifikt

