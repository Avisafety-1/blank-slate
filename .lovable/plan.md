

## Plan: Test alle 14 prosjekter for enheter

### Problemet
Vi har kun testet device-endepunktet for **1 av 14 prosjekter** ("Trening på bruk av Avisafe"). Dronen `1581F8DBW255D00A2M0U` kan ligge i et av de andre 13. I tillegg har `list-devices` aldri dukket opp i loggene, noe som tyder på at den koden kanskje aldri kjøres.

API-versjonen er bekreftet v0.1 — dokumentasjonen viser at disse endepunktene eksisterer:
- `GET /openapi/v0.1/device` (org-nivå)
- `GET /openapi/v0.1/project/device` (prosjekt-nivå, med `X-Project-Uuid`)
- `GET /openapi/v0.1/device/hms` (HMS)

### Endringer

**1. Utvide `test-device-api` i `flighthub2-proxy/index.ts`**

Erstatte test #4 (som kun sjekker første prosjekt) med en loop over ALLE prosjekter:

```
// For hvert prosjekt: GET /openapi/v0.1/project/device med X-Project-Uuid
results.all_projects = projects.map(p => ({
  uuid: p.project_uuid,
  name: p.name || p.project_name,
  status: response.status,
  device_count: parsed?.data?.list?.length ?? 0,
  body_preview: text.substring(0, 500)
}))
```

Returnerer kompakt oppsummering per prosjekt: UUID, navn, HTTP-status, antall enheter, og rå body-preview (for de som har data).

**2. Ingen UI-endringer**

`FH2DevicesSection.tsx` viser allerede hele `results`-objektet som rå JSON.

**3. Deploy og test**

### Forventet resultat
Vi ser om noen av de 14 prosjektene inneholder enheter. Hvis alle returnerer `list: null`, er konklusjonen at FlightHub Sync ikke er aktivert eller at API-nøkkelen mangler device-rettigheter.

