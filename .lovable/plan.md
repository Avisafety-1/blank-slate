# Audit: gjenstående propagation-hull mor → avdeling

## Status etter forrige fiks

**Allerede løst:**
- `companies`-felt (luftroms-adv., skjul rapportør, oppdragsgodkjenning, prevent self-approval, ack maintenance, SORA-krav, avvik, SafeSky callsign) → DB-trigger re-syncer ved enhver oppdatering
- `propagate_sora_config` → `ai-risk-assessment` leser mor sin `company_sora_config` ved kjøring

**Allerede korrekt (read-time, ingen sync trengs):**
- `propagate_fh2_credentials` → `flighthub2-proxy` + webhook-config leser mor
- `propagate_sora_approval` → RPC `get_effective_sora_approval_config`
- `propagate_deviation_report` → LogFlightTimeDialog leser effektiv verdi
- `propagate_flight_alerts` → UploadDroneLogDialog bruker RPC `get_effective_flight_alert_config`

## Hull som gjenstår

Disse propagation-flaggene kopierer kun data ved første toggle og leses fra avdelingens egen rad. Senere endringer hos mor når aldri avdelinger:

### 1. `propagate_mission_roles` (oppdragsroller)
- **Lagring:** `company_mission_roles` (én rad per rolle per selskap)
- **Forbruker:** `AddMissionDialog.fetchCompanyMissionRoles` leser kun `eq company_id`
- **Symptom:** Mor legger til/endrer/sletter en rolle → avdeling ser fortsatt gammelt sett
- **Fiks:** Trigger på `company_mission_roles` (INSERT/UPDATE/DELETE). Når raden tilhører en mor med `propagate_mission_roles = true`, speil endringen til alle avdelinger. Pluss engangs-backfill.

### 2. `propagate_sora_buffer_mode` (SORA-defaults: bufferMode + flight geography + altitude)
- **Lagring:** `company_sora_config.default_buffer_mode`, `default_flight_geography_m`, `default_flight_altitude_m`
- **Forbrukere:** `src/pages/Kart.tsx`, `src/components/dashboard/ExpandedMapDialog.tsx` leser kun avdelingens egen rad
- **Symptom:** Mor endrer default buffer mode → avdeling ser sin gamle default
- **Fiks:** Trigger på `company_sora_config` AFTER UPDATE. Når raden tilhører en mor og mor har `propagate_sora_buffer_mode = true`, oppdater disse tre feltene på alle avdelingers `company_sora_config` (upsert). Pluss engangs-backfill.

### 3. `propagate_flight_alerts` (datarad-konsistens)
- **Lagring:** `company_flight_alerts` + `company_flight_alert_recipients`
- **Forbruker:** Bruker allerede RPC som leser mor — så pålogget bruk er korrekt
- **Hull:** Hvis en avdelings-admin redigerer sine egne `company_flight_alerts`-rader mens propagation er på, vil endringene ligge "under" men aldri brukes (forvirrende UI-tilstand). Eventuelt: blokker UPDATE/INSERT på avdelingens rader når mor propagerer (gjennom RLS eller trigger). Lavere prioritet.

## Anbefalt rekkefølge

1. **Mission roles re-sync trigger** (#1) — størst funksjonelt hull
2. **SORA-defaults re-sync trigger** (#2) — samme mønster
3. **Flight alerts forsvars-lås** (#3) — kun hvis vi opplever rot i praksis

## Tekniske detaljer

### Trigger for company_mission_roles
```text
AFTER INSERT/UPDATE/DELETE ON company_mission_roles
FOR EACH ROW
  hvis OLD/NEW.company_id tilhører en parent (parent_company_id IS NULL)
    og den parent har propagate_mission_roles = true:
      INSERT → opprett samme rolle (navn) i alle avdelinger som mangler den
      UPDATE → endre navn på matchende rolle i alle avdelinger
      DELETE → slett matchende rolle i alle avdelinger
```
Matching gjøres på `name` (kombinasjon med company_id) siden id-er er ulike per avdeling.

### Trigger for company_sora_config (SORA-defaults)
```text
AFTER UPDATE ON company_sora_config
FOR EACH ROW
  hvis raden tilhører en parent og parent.propagate_sora_buffer_mode = true,
  og minst ett av de tre defaultsene endret seg:
    UPSERT på alle avdelingers company_sora_config — bare de tre default-feltene
```
Berører ikke andre SORA-config-felt (de styres av `propagate_sora_config` som allerede er read-time i ai-risk-assessment).

### Engangs-backfill
Kort SQL som syncer eksisterende skjevheter for begge tabellene.

## Hva som IKKE endres

- Frontend-komponenter — alle eksisterende skjermbilder fortsetter å fungere uendret
- RLS-policies
- Edge functions
- Ingen nye kolonner

## Risiko

- Triggerne kjører kun når mor-rader endres → ingen ekstra last på normal drift
- Re-entrancy: triggeren oppdaterer avdelingsrader, ikke mor → ingen rekursjon
- Sletting av roller på mor sletter automatisk på avdelinger — påvirker `mission_personnel.role_id` ON DELETE SET NULL (allerede konfigurert via prosjektets standard for bevart historikk)

Vil du at jeg implementerer #1 og #2 nå?
