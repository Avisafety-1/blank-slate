

## FlightHub 2 API-utvidelse: Enheter, HMS og Personell

### Bakgrunn
FH2 OpenAPI V1.0 tilbyr flere endepunkter vi ikke bruker i dag. API-dokumentasjonen bekrefter at **prosjektoppretting ikke er støttet** via API -- det må gjøres i FH2 UI. Men vi kan hente mye nyttig data.

### Hva API-et tilbyr og hva som er smart

| Funksjon | Endpoint | Verdi |
|---|---|---|
| **Liste enheter (org)** | `GET /openapi/v0.1/device` | Alle droner + docks med SN, modell, online-status, kamera-info |
| **Liste enheter (prosjekt)** | `GET /openapi/v0.1/project/device` | Enheter filtrert per prosjekt |
| **Device state (detaljert)** | `GET /openapi/v0.1/device/{sn}/state` | Batteri, GPS, temperatur, vind, firmware, vedlikeholdsstatus, lagring, RTK-info |
| **HMS (helsestatus)** | `GET /openapi/v0.1/device/hms` | Feilkoder og advarsler per enhet |
| **Legg til personell** | `PUT /openapi/v0.1/project/member` | Legg Avisafe-brukere til FH2-prosjekter |
| ~~Opprett prosjekt~~ | Ikke tilgjengelig | Eksplisitt ikke støttet i API |

### Plan

#### 1. Edge function: Nye actions i `flighthub2-proxy`
Legge til 4 nye actions:

- **`list-devices`** -- Kaller `GET /openapi/v0.1/device` (org-nivå). Returnerer alle droner/docks med SN, modell, online-status, kameraer.
- **`device-state`** -- Kaller `GET /openapi/v0.1/device/{device_sn}/state`. Tar `deviceSn` som parameter. Returnerer detaljert enhetsstatus (batteri, GPS, firmware, vedlikehold, vind, temperatur).
- **`device-hms`** -- Kaller `GET /openapi/v0.1/device/hms?device_sn_list=...`. Tar `deviceSnList` (kommaseparert). Returnerer HMS-advarsler.
- **`add-project-member`** -- Kaller `PUT /openapi/v0.1/project/member`. Tar `projectUuid`, `userId`, `role` ("project-member" eller "project-admin"), og `nickname`.

#### 2. UI: FlightHub 2 Enheter-seksjon i admin
Ny seksjon under FH2-tilkoblingspanelet (kun synlig når `fh2Connected`):

- **Enhetsliste**: Tabell/kort med alle droner og docks fra FH2
  - Kolonner: Navn (callsign), Modell, SN, Online-status (gron/rod dot), Type (drone/dock)
  - Klikk pa en enhet aper en detaljdialog med full `device-state` data
- **Enhet-detaljdialog**: Viser batteri %, firmware-versjon, GPS-kvalitet, temperatur, vindhastighet, vedlikeholdsstatus, lagringsplass, HMS-advarsler
- **Personell-knapp** per prosjekt: "Legg til personell i FH2" med felt for user_id, rolle og nickname

#### 3. Auto-matching mot Avisafe-droner
Nar enhetslisten hentes, matche SN mot `drones.serienummer` / `drones.internal_serial` for a vise hvilke FH2-enheter som allerede finnes i Avisafe.

### Tekniske detaljer

**Edge function endringer** (`supabase/functions/flighthub2-proxy/index.ts`):
- 4 nye `if (action === "...")` blokker, alle med dual API variant support (new + old)
- `list-devices`: `GET {base}/openapi/v0.1/device` med org-header
- `device-state`: `GET {base}/openapi/v0.1/device/{sn}/state` med project-header
- `device-hms`: `GET {base}/openapi/v0.1/device/hms?device_sn_list={sns}` med project-header
- `add-project-member`: `PUT {base}/openapi/v0.1/project/member` med project-header og JSON body

**UI endringer** (`src/components/admin/ChildCompaniesSection.tsx`):
- Ny state: `fh2Devices`, `fh2DeviceDetail`, `fh2LoadingDevices`
- "Hent enheter"-knapp som kaller `list-devices`
- Ekspanderbar rad per enhet som kaller `device-state` og `device-hms`
- Enkel dialog for "Legg til personell" per prosjekt

