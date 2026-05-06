# Runde 3 — Lås ned SECURITY DEFINER-funksjoner

## Mål
Fjerne ~94 lints (`anon_security_definer_function_executable` + `authenticated_security_definer_function_executable`) ved å fjerne unødvendig EXECUTE-tilgang. **Null brukerpåvirkning** er ufravikelig krav.

## Bakgrunnsanalyse

Det er **47 callable** SECURITY DEFINER-funksjoner i `public` (triggers er ekskludert — de kjører som table owner, ikke via grants).

Alle har i dag `EXECUTE` for både `anon` OG `authenticated`. Frontend kaller faktisk kun 11 RPC-er. Edge-funksjoner bruker service_role og påvirkes IKKE av grants.

### Kategorisering

**A. Frontend RPC-er (kalles via `supabase.rpc()` fra browser)** — beholdes for `authenticated`, fjernes for `anon`:
- `can_user_access_company`, `check_mission_airspace`, `get_ai_risk_eta_ms`, `get_incident_responsible_users`, `get_naturvern_in_bounds`, `get_user_accessible_companies`, `get_user_visible_company_ids`, `get_vern_restrictions_in_bounds`, `update_eccairs_credentials`, `update_email_settings`

**B. Anon-RPC under registrering** — beholdes for både `anon` og `authenticated`:
- `get_company_by_registration_code` (kalles under signup før innlogging)

**C. RLS-hjelpere (referert inne i policy-uttrykk)** — beholdes for `authenticated` (RLS evaluerer som calling user), fjernes for `anon`:
- `has_role`, `is_superadmin`, `get_user_role`, `get_user_company_id`, `get_parent_company_id`, `get_user_readable_company_ids`, `get_user_incident_visible_company_ids`, `can_read_folder`, `get_effective_parent_company_id`, `get_effective_deviation_categories`, `get_effective_flight_alert_config`, `get_effective_sora_approval_config`, `has_effective_deviation_categories`, `check_mission_zone_conflicts`, `get_mission_approvers`

**D. Kun for edge functions / admin-jobber** — fjernes for både `anon` OG `authenticated`:
- `bulk_upsert_geojson_features`, `bulk_upsert_naturvern_zones`, `bulk_upsert_vern_restrictions`, `upsert_geojson_feature`, `upsert_naturvern_zone`, `upsert_vern_restriction`, `upsert_openaip_airspace`
- `get_eccairs_credentials`, `get_fh2_token`, `save_fh2_token`, `get_linkedin_token`, `upsert_linkedin_token`
- `get_platform_statistics`, `match_manual_chunks`
- `add_drone_flight_hours`, `add_equipment_flight_hours` (kalles fra DB-triggers/edge, ikke frontend)

**E. PostGIS extension-funksjoner (kan ikke endres)** — markeres som akseptert risiko:
- `st_estimatedextent` (3 overloads)

### Verifisering før migrasjon
- `rg "supabase.rpc\("` i `src/` — 11 unike navn, alle dekket av kategori A/B
- `rg "supabase.rpc\("` i `supabase/functions/` — bruker service_role, upåvirket av grants
- RLS-policies som bruker hjelpere i C: kjører som `authenticated`, fortsatt OK

## Migrasjon

```sql
-- A + C: Fjern anon, behold authenticated
REVOKE EXECUTE ON FUNCTION public.can_user_access_company(uuid, uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_mission_airspace(double precision, double precision, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_risk_eta_ms()                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_incident_responsible_users(uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_naturvern_in_bounds(double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_accessible_companies(uuid)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_visible_company_ids(uuid)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vern_restrictions_in_bounds(double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_eccairs_credentials(uuid, text, text, text, text) FROM anon;  -- juster signatur ved behov
REVOKE EXECUTE ON FUNCTION public.update_email_settings(...) FROM anon;
-- C
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid)                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid)                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_parent_company_id(uuid)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_readable_company_ids(uuid)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_incident_visible_company_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_folder(uuid)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_parent_company_id(uuid)       FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_deviation_categories(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_flight_alert_config(uuid)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_sora_approval_config(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_effective_deviation_categories(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_mission_zone_conflicts(double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_mission_approvers(uuid)                 FROM anon;

-- D: Fjern både anon og authenticated
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_geojson_features(text, jsonb)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_naturvern_zones(jsonb)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_vern_restrictions(jsonb)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_geojson_feature(...)                      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_naturvern_zone(...)                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_vern_restriction(...)                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_openaip_airspace(...)                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_eccairs_credentials(uuid, text)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_fh2_token(uuid, text)                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_fh2_token(uuid, text, text)                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_linkedin_token(uuid, text)                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_linkedin_token(...)                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_statistics(uuid)                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_manual_chunks(uuid, vector, integer)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_drone_flight_hours(uuid, integer)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_equipment_flight_hours(uuid, integer)        FROM anon, authenticated;
```

(Eksakte signaturer hentes fra `pg_proc` rett før migrasjonen kjøres.)

## Risikomatrise

| Kategori | Risiko | Mitigering |
|---|---|---|
| A — frontend RPC | **Lav** — `authenticated` beholder tilgang | Test innlogget bruker |
| B — registrering | **Ingen** — uendret | n/a |
| C — RLS-hjelpere | **Medium** — hvis en RLS-policy faktisk evalueres som `anon` for offentlige sider, vil tilgang brytes | Verifisert: alle tabeller med disse hjelperne i policy har `TO authenticated` |
| D — edge-only | **Lav** — service_role bypass'er grants | Test edge functions: FH2-token, ECCAIRS, LinkedIn, platform-statistics, AI-search |
| E — PostGIS | **Akseptert** — kan ikke endres uten å bryte extension | Marker som ignored |

## Test-plan etter migrasjon

1. **Innlogging + dashboard** — RLS-hjelpere (`has_role`, `get_user_visible_company_ids`) må fungere
2. **Registrering ny bruker med selskapskode** — `get_company_by_registration_code` (anon)
3. **Kart** — `get_naturvern_in_bounds`, `get_vern_restrictions_in_bounds`, `check_mission_airspace`
4. **Oppdrag/incidents** — `get_incident_responsible_users`, `get_mission_approvers`
5. **Admin → E-postinnstillinger** — `update_email_settings`
6. **Admin → ECCAIRS** — `update_eccairs_credentials`
7. **AI-risk dialog** — `get_ai_risk_eta_ms`
8. **Edge: FH2-sync** — `get_fh2_token` via service_role
9. **Edge: LinkedIn publish** — `get_linkedin_token`
10. **Edge: AI-search / manual chunks** — `match_manual_chunks`

## Rollback-plan

Én migrasjon gjenoppretter alt:

```sql
GRANT EXECUTE ON FUNCTION public.<navn>(<args>) TO anon, authenticated;
-- gjentas for alle 47 funksjoner
```

Backup-script lagres i `.lovable/plan-rollback-runde3.sql` før utrulling. Alternativt: rull tilbake migrasjonen via Lovable-historikk.

## Forventet resultat

- **~94 lints fjernet** (47 funksjoner × 2 advarsler hver, minus 3 PostGIS som markeres akseptert)
- **3 PostGIS-funksjoner** markeres som akseptert risiko via `manage_security_finding` med begrunnelse "extension-owned, cannot revoke without breaking PostGIS"
- **Null endring** i hva brukere kan gjøre

## Anbefaling

Kjør i to bolker for ekstra trygghet:
- **Bolk 1:** Kategori D (edge-only) — null risiko for brukere
- **Bolk 2:** Kategori A + C — krever frontend-test

Si fra hvis du vil ha det i én migrasjon eller delt opp.
