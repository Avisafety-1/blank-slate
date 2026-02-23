

# Lagre DroneLog API-dokumentasjon i prosjektet

## Oversikt

Opprette en ryddig referansefil med DroneLog API-dokumentasjonen under `docs/`-mappen, slik at den er tilgjengelig for fremtidig bruk og integrasjon.

## Hva dokumentasjonen dekker

DroneLog API (https://dronelogapi.com) er en REST API for parsing og behandling av DJI drone-flylogger. Den har folgende endepunkter:

### Autentisering
- Bearer token via `Authorization`-header

### Endepunkter

| Endepunkt | Metode | Beskrivelse |
|---|---|---|
| `api/v1/keys` | GET | Liste API-nokler |
| `api/v1/keys` | POST | Opprett API-nokkel |
| `api/v1/keys/{key}` | DELETE | Slett API-nokkel |
| `api/v1/accounts/dji` | POST | Hent DJI-konto-ID (e-post/passord sendes til DJI, lagres ikke) |
| `api/v1/fields` | GET | Liste alle tilgjengelige flylogg-felter |
| `api/v1/fields/{fieldName}` | GET | Hent metadata for ett felt |
| `api/v1/logs` | POST | Prosesser flylogg fra URL (returnerer CSV) |
| `api/v1/logs/upload` | POST | Last opp flylogg-fil (returnerer CSV) |
| `api/v1/logs/{id}` | GET | Liste flylogger for en DJI-konto-ID (paginert) |
| `api/v1/usage` | GET | Hent API-bruksstatistikk |

### Viktige detaljer
- Flylogger ma vaere i TXT- eller ZIP-format (DJI-format)
- Man kan spesifisere hvilke felter man vil ha i CSV-output (f.eks. `OSD.latitude`, `OSD.longitude`, `OSD.flyTimeMilliseconds`)
- Responser folger monsteret `{ statusCode, message, result }`
- Usage-endepunktet stotter filtrering pa dato og paginering

## Plan

Opprette en ny fil `docs/dronelog-api-reference.md` som inneholder:
- Komplett API-referanse med alle endepunkter
- Eksempler pa request/response i JavaScript
- Feltbeskrivelser
- Autentiseringsinformasjon

### Fil som opprettes

| Fil | Beskrivelse |
|---|---|
| `docs/dronelog-api-reference.md` | Komplett DroneLog API-dokumentasjon for fremtidig referanse |

