

## Plan: Fikse FH2 list-devices (manglende Aircraft) + diagnoseverktøy + bygg-feil

### Diagnose
1. `list-devices` returnerer Dock 3 fordi `/openapi/v0.1/device` (org-level) gir et `{gateway: Dock3, drone: null}`-element når drona ikke er dokket/online. Proxyen flatter ut dette, får 1 enhet (>0), og returnerer **uten** å kjøre `/project/device`-fallback. M4TD finnes kun via prosjekt-endepunktet (Aircraft-tab i FH2 = prosjekt-bundne droner).
2. Bygg-feiler: `src/sw.ts` importerer `workbox-precaching/routing/strategies` som ikke er installert som devDependencies (typer mangler), og `__WB_MANIFEST` har ingen typedeklarasjon.

### Endringer

**1. `supabase/functions/flighthub2-proxy/index.ts` — `list-devices`-action**
- Endre logikken slik at vi **alltid** slår sammen org-resultat + alle prosjekt-resultater (ikke bare når org er tom). Dedupliser på `device_sn`.
- Når org-elementer har `sub_devices` / `children` / `bind_device` / `drone_sn` / `child_device_sn`-felter, flatt ut disse til egne enheter og merk `_dji_role` korrekt (gateway/drone).
- Returner alltid `diagnostics`-array med både org- og prosjekt-stage så vi kan se per-prosjekt status.

**2. Ny action `debug-endpoint` i samme edge-funksjon**
- Tar `endpoint` (string, f.eks. `system_status`, `device`, `project/device`, `device/{sn}/state`, `device/hms?...`) og valgfri `method`/`projectUuid`.
- Bygger URL mot både `openapi/v0.1` og `manage/api/v1.0`, sender med riktige headere, og returnerer rå status + body for hver variant.
- Brukes som «sandkasse» for å verifisere hvilke API-kall som fungerer mot kundens token uten å skrive nye actions.

**3. UI: «Test enhets-API» i `CompanySettings` / FH2-seksjon (komponent som inneholder knappen i skjermbildet)**
- Utvid eksisterende «Test enhets-API»-knapp til en liten meny / dialog med forhåndsdefinerte tester:
  - System status (`GET /system_status`)
  - List org-enheter (`GET /device`)
  - List prosjekt-enheter (per prosjekt fra dropdown)
  - Device state for valgt SN
  - HMS for valgt SN
- Kaller `flighthub2-proxy` med `action: "debug-endpoint"` og viser rå JSON-respons + status i dialogen, slik at vi (og kunden) raskt ser hvilke endepunkter som svarer hva.

**4. `src/sw.ts` — fikse bygg-feil**
- Legg til devDependencies: `workbox-precaching`, `workbox-routing`, `workbox-strategies` (vil bli foreslått via add-dependencies-action).
- Alternativ hvis dependency-installasjon ikke er ønsket: rull tilbake `sw.ts` til en variant uten workbox (nettverk-først håndtering inline) og deklarer `self.__WB_MANIFEST` som `any` via `declare const`. Foretrukket løsning er å installere workbox-pakkene siden Vite PWA `injectManifest` allerede forventer dem.

### Filer som endres
- `supabase/functions/flighthub2-proxy/index.ts` (ny merge-logikk + `debug-endpoint`-action)
- Komponenten med «Test enhets-API»-knappen (FH2-seksjonen i `CompanySettings` / `CompanyManagementSection` — identifiseres ved implementering) — utvides med diagnose-dialog
- `src/sw.ts` + `package.json` (workbox-pakker)

### Resultat
- Aircraft-tab-droner (M4TD og fremtidige) vises i Avisafe selv når de ikke er dokket, fordi vi alltid merger inn `/project/device`-resultater.
- Vi får et innebygd diagnoseverktøy for å teste FH2-endepunkter direkte fra UI uten å gjette i loggene.
- Bygg-feilene i `src/sw.ts` forsvinner.

