# Runde 1 — Trygge sikkerhetsfikser uten funksjonell påvirkning

## Mål
Fikse 8 av 138 lint-advarsler uten å endre noen brukers tilganger eller funksjonalitet.

## Hva som inkluderes (og hvorfor det er trygt)

### Del A — Fjern 3 meningsløse "service role"-policies (3 lints)

Service role bypasser **all** RLS uansett. Disse policiene gir derfor ingen ekstra tilgang — de er kun støy som lurer linteren til å tro at vanlige brukere har full skrivetilgang:

| Tabell | Policy som droppes | Forblir uendret |
|---|---|---|
| `bulk_email_campaigns` | `Service role can insert campaigns` (INSERT, with_check=true) | `Admins can view own company campaigns` (SELECT, RLS-begrenset) |
| `bulk_email_campaigns` | `Service role can update campaigns` (UPDATE, qual=true) | samme som over |
| `safesky_beacons` | `Service role can manage beacons` (ALL, qual=true, with_check=true) | `Authenticated users can view beacons` (SELECT for innloggede) |
| `terrain_elevation_cache` | `Service role can insert terrain cache` (INSERT, with_check=true) | `Authenticated users can read terrain cache` (SELECT) |

**Verifisert at dette er trygt:**
- `bulk_email_campaigns` skrives kun av edge-funksjonen `send-notification-email` med `SUPABASE_SERVICE_ROLE_KEY` → bypasser RLS → uberørt. Frontend (`CampaignHistorySection.tsx`) gjør kun SELECT.
- `safesky_beacons` skrives kun av edge-funksjonene `safesky-beacons-fetch` / `safesky-cron-refresh` med service role. Frontend (`mapSafeSky.ts`, `StartFlightDialog.tsx`) gjør kun SELECT + realtime-lytting.
- `terrain_elevation_cache` skrives kun av edge-funksjonen `terrain-elevation` med service role.

**Resultat for brukere:** Ingen endring. Vanlige brukere hadde aldri reell INSERT/UPDATE-tilgang her — disse policiene var bare formelt definert. Edge-funksjoner fortsetter å fungere identisk fordi de bruker service-rollen.

### Del B — Sett `search_path = public` på 5 funksjoner (5 lints)

Funksjoner som flagges:
- `update_drone_flight_hours` (SECURITY DEFINER)
- `update_equipment_flight_hours` (SECURITY DEFINER)
- `sync_user_companies_on_role_change` (SECURITY DEFINER)
- `set_updated_at` (vanlig trigger-funksjon)
- `set_dronetag_devices_updated_at` (vanlig trigger-funksjon)

Endring: Legge til `SET search_path = public` på funksjonsdefinisjonen (kun en metadata-attributt — kropp, signatur og logikk er uendret).

**Resultat for brukere:** Ingen endring. Funksjonene refererer kun til objekter i `public`-skjemaet, så å låse search_path til `public` gir identisk oppførsel — bare beskytter mot teoretisk schema-hijacking.

## Hva som **IKKE** er med i runde 1

| Lint | Hvorfor utsatt |
|---|---|
| `companies` INSERT-policy `Authenticated users can create companies` (with_check=true) | Brukes aktivt av Auth.tsx (linje 455) når en ny bruker registrerer eget selskap via Google-reg. Å stramme denne uten omtanke kan **bryte registreringsflyten**. Krever egen runde med sjekk-logikk (f.eks. "bruker må ikke allerede ha company_id") og testing. |
| `public_bucket_allows_listing` (5 buckets) | Krever endring fra public til private buckets + bytte til signed URLs i kode. Funksjonell endring → egen runde. |
| `auth_leaked_password_protection` | Manuell toggle i Supabase Auth-innstillinger (ingen migrasjon). |
| 118x `*_security_definer_function_executable` | Krever audit av 59 funksjoner. Egen runde. |
| 3x `extension_in_public` | Anbefales ignorert (flytting er risikabelt, gevinst kosmetisk). |

## Migrasjon (én SQL-fil)

```sql
-- Del A: Fjern redundante service-role policies (service role bypasser RLS)
DROP POLICY IF EXISTS "Service role can insert campaigns"      ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Service role can update campaigns"      ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Service role can manage beacons"        ON public.safesky_beacons;
DROP POLICY IF EXISTS "Service role can insert terrain cache"  ON public.terrain_elevation_cache;

-- Del B: Lås search_path på 5 funksjoner
ALTER FUNCTION public.update_drone_flight_hours()        SET search_path = public;
ALTER FUNCTION public.update_equipment_flight_hours()    SET search_path = public;
ALTER FUNCTION public.sync_user_companies_on_role_change() SET search_path = public;
ALTER FUNCTION public.set_updated_at()                   SET search_path = public;
ALTER FUNCTION public.set_dronetag_devices_updated_at()  SET search_path = public;
```

(Ingen funksjoner tar argumenter — verifisert via `pg_proc`.)

## Risikomatrise

| Endring | Funksjonell risiko | Rollback |
|---|---|---|
| DROP 4 service-role policies | **Null** — service role bypasser RLS | `CREATE POLICY ...` på nytt (trivielt) |
| ALTER FUNCTION search_path | **Null** — kun metadata, ingen kropp-endring | `ALTER FUNCTION ... RESET search_path` |

## Forventet resultat
- 8 av 138 lints fjernet (5 search_path + 3 always_true; den 4. always_true på `safesky_beacons.ALL` er én policy → 1 lint, men den 5. always_true var `companies` som vi utsetter).
- Faktisk: 4 always_true → 3 fikses i denne runden, 1 (`companies`) utsettes. Pluss 5 search_path = **8 lints fikset**.
- Null endring i hva brukere kan se eller gjøre.
