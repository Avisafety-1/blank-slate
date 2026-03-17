

## Disk IO Budget — Analyse og optimaliseringsplan

### Rotårsak

Prosjektet har flere **høyfrekvente polling-løkker og realtime-triggere** som genererer konstant disk IO:

| Kilde | Frekvens | IO-type |
|-------|----------|---------|
| Kart-heartbeat (`map_viewer_heartbeats` upsert) | Hvert **5. sekund** per kartbruker | Skriving |
| SafeSky-polling (`safesky_beacons` SELECT) | Hvert **5. sekund** per kartbruker | Lesing |
| Drone-telemetri polling | Hvert **5. sekund** per kartbruker | Lesing |
| Oppdrag realtime | Enhver endring → **2 fulle refetch** med 9+ sub-queries | Lesing |
| Postgres realtime (WAL) | ~20 tabeller overvåket | WAL-lesing |
| Subscription-sjekk | Hvert 60. sekund | Lesing |

Med f.eks. 5 samtidige kartbrukere = **~180 DB-operasjoner/minutt** bare fra kart-polling.

### Plan

#### 1. Øk kart-heartbeat fra 5s → 30s
**Fil:** `src/components/OpenAIPMap.tsx` (linje 543)

Heartbeats trenger ikke 5s-oppløsning. 30s er tilstrekkelig for å detektere aktive viewers.

#### 2. Fjern SafeSky 5s-polling (behold kun realtime)
**Fil:** `src/lib/mapSafeSky.ts` (linje 308-310)

SafeSky har allerede en realtime-kanal på `safesky_beacons` (linje 312-319). 5s-polling er redundant. Fjern `setInterval` og la realtime-kanalen drive oppdateringer alene.

#### 3. Øk drone-telemetri polling fra 5s → 15s
**Fil:** `src/components/OpenAIPMap.tsx` (linje 563)

Telemetri har også en realtime-kanal (`drone_telemetry`). Polling er kun backup — 15s er tilstrekkelig.

#### 4. Debounce oppdrag realtime-handler
**Fil:** `src/hooks/useOppdragData.ts` (linje 52-57)

Enhver endring i `missions`, `mission_personnel`, `mission_drones` eller `flight_logs` trigger **to fulle refetch-sykluser** med 9+ queries hver. Legg til 2s debounce slik at raske endringer (f.eks. batch-oppdateringer) samles til én refetch.

#### 5. Debounce Admin realtime-handler
**Fil:** `src/pages/Admin.tsx`

Admin-sidenes realtime-kanaler kaller `fetchData()` på hver endring uten debounce.

### Samlet effekt

| Optimalisering | Estimert IO-reduksjon |
|----------------|----------------------|
| Heartbeat 5s→30s | ~83% færre skrivinger |
| Fjern SafeSky poll | ~100% av poll-lesinger (realtime dekker) |
| Telemetri 5s→15s | ~67% færre lesinger |
| Debounce oppdrag | Eliminerer burst-queries |

Samlet bør dette redusere disk IO med **60-80%** for typisk bruk.

