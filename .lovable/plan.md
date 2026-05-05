# Begrens superadmin til eget selskap i Hendelser

## Problem
SELECT-policyen `Users can view incidents from own company` på `public.incidents` har:
```
USING (company_id = ANY (get_user_incident_visible_company_ids(auth.uid()))
       OR is_superadmin(auth.uid()))
```
`OR is_superadmin(...)` overstyrer selskapsfilteret, så Avisafe-superadmins ser hendelser fra alle kunder.

## Endring
Fjern OR-delen. Superadmins faller tilbake til samme regel som vanlige brukere — kun selskaper returnert av `get_user_incident_visible_company_ids` (eget selskap + datterselskaper).

```sql
drop policy if exists "Users can view incidents from own company" on public.incidents;

create policy "Users can view incidents from own company"
  on public.incidents
  for select
  to authenticated
  using (company_id = ANY (get_user_incident_visible_company_ids(auth.uid())));
```

## Konsekvens
- Avisafe-superadmin på `/hendelser` ser nå kun Avisafe sine hendelser (+ ev. datterselskaper).
- UPDATE/DELETE-policyene for superadmin er allerede selskap-scopet (`company_id = ANY (get_user_visible_company_ids(...))` / `= get_user_company_id(...)`), så de er uberørt.
- Andre roller (admin, saksbehandler, vanlig bruker) er uberørt.
- Hvis Avisafe trenger global innsikt senere, gjøres det via en egen edge function med service role — ikke via RLS-bypass.
