## Mål
Redusere DB-belastning med to lav-risiko grep: legge til sammensatte indekser som matcher faktiske filter+sort-mønstre, og fjerne `map_viewer_heartbeats` fra Realtime-publication (skrives ofte, ingen lyttere).

## Funn

### Realtime-publication
Tabeller publisert til `supabase_realtime`:
`companies, company_sora_config, customers, drone_accessories, drone_telemetry, dronetag_positions, incident_comments, incidents, map_viewer_heartbeats, missions, news, safesky_beacons`

- **`map_viewer_heartbeats`** — INGEN frontend-subscription funnet via kodesøk. Skrives hvert 30s per innlogget bruker av `useAppHeartbeat`. Ren WAL-støy. → **Fjern fra publication.**
- Resten har faktiske lyttere → behold.

Realtime står for ~78% av total DB-tid; å fjerne den hyppigst-skrevne tabellen uten lyttere bør kutte en betydelig del.

### Spørringsmønstre vi indekserer for

| Spørring (forenklet) | Indeks |
|---|---|
| `missions WHERE company_id=? AND approval_status=? ORDER BY submitted_for_approval_at DESC` | `(company_id, approval_status, submitted_for_approval_at DESC)` |
| `equipment WHERE aktiv=? ORDER BY opprettet_dato DESC` | `(aktiv, opprettet_dato DESC)` |
| `drones WHERE aktiv=? ORDER BY opprettet_dato DESC` | `(aktiv, opprettet_dato DESC)` |
| `drone_personnel WHERE drone_id=?` (LATERAL join) | `(drone_id)` |

Sammensatte indekser dekker både filter og sort i samme indeksskan → ingen ekstra sort-steg.

## Endringer

### Migrasjon: indekser + drop fra realtime
```sql
-- Sammensatte indekser matchet til faktiske queries
CREATE INDEX IF NOT EXISTS idx_missions_company_approval_submitted
  ON public.missions (company_id, approval_status, submitted_for_approval_at DESC);

CREATE INDEX IF NOT EXISTS idx_equipment_active_created
  ON public.equipment (aktiv, opprettet_dato DESC);

CREATE INDEX IF NOT EXISTS idx_drones_active_created
  ON public.drones (aktiv, opprettet_dato DESC);

CREATE INDEX IF NOT EXISTS idx_drone_personnel_drone_id
  ON public.drone_personnel (drone_id);

-- Fjern høy-skriv tabell uten lyttere fra realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.map_viewer_heartbeats;
```

Ingen kodeendringer nødvendig.
- Eksisterende `idx_missions_company_id` (single-column) blir overflødig av den nye sammensatte (Postgres kan bruke prefix), men vi lar den stå — å droppe gir ingen merkbar gevinst og øker risikoen.
- Edge-funksjoner som leser `map_viewer_heartbeats` bruker SELECT, ikke realtime — fortsetter å fungere.

## Risiko
Lav. Indekser er additive; realtime-drop er bekreftet trygt via kodesøk (ingen `.on('postgres_changes', ..., { table: 'map_viewer_heartbeats' })`).

## Forventet effekt
- Approval-queue spørring (1.8M kall/uke) blir betydelig raskere — indeksen serverer både filter og sort.
- `drones`/`equipment` listing merkbart raskere ved mange rader.
- Realtime-overhead synker når heartbeat-WAL-støyen forsvinner.

## Mulig oppfølging (ikke i denne runden)
- FH2-sync skriver `companies.flighthub2_base_url` 152k ganger — bør kun skrive ved endring.
- Cache `profiles.can_approve_missions` / `can_be_incident_responsible` i AuthContext.
- Debounce + LRU-cache `check_mission_airspace` RPC.
