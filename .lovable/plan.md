

## Fiks: Erstatt rekursiv RLS-policy med SECURITY DEFINER-funksjon

### Problem
Den nåværende RLS-policyen på `companies` inneholder en subquery som leser fra `companies` selv, noe som trigger uendelig rekursjon (error 42P17). Dette forårsaker database-timeouts som logger ut alle brukere.

### Løsning
1. **Opprett `get_parent_company_id(uuid)` funksjon** — SECURITY DEFINER som bypasser RLS for å hente `parent_company_id` uten rekursjon.
2. **Erstatt RLS-policyen** — Bruk den nye funksjonen i stedet for subquery.

### SQL-migrasjon
```sql
CREATE OR REPLACE FUNCTION public.get_parent_company_id(_company_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$ SELECT parent_company_id FROM public.companies WHERE id = _company_id $$;

DROP POLICY IF EXISTS "Users can view own company, parent and children" ON public.companies;
CREATE POLICY "Users can view own company, parent and children" ON public.companies
FOR SELECT TO authenticated
USING (
  id = get_user_company_id(auth.uid())
  OR parent_company_id = get_user_company_id(auth.uid())
  OR id = get_parent_company_id(get_user_company_id(auth.uid()))
);
```

### Ingen frontend-endringer nødvendig
AuthContext-koden er allerede korrekt — den prøver å lese parent company, men feiler pga. RLS. Når policyen er fikset vil den fungere.

