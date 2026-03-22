

## Plan: Fiks SORA-arv — avdelinger kan ikke lese morselskapets config (RLS-problem)

### Rotårsak
RLS-policyen på `company_sora_config` bruker `get_user_visible_company_ids()`, som returnerer brukerens eget selskap + dets barn. Når en bruker er i Bodø 1 (barn av Norconsult), inkluderer denne funksjonen **ikke** Norconsult. Derfor blokkeres `SELECT` mot morselskapets config, og fallback-logikken finner aldri parent-configen. Banneret vises aldri.

### Løsning
Oppdater `get_user_visible_company_ids()` til å **også inkludere parent_company_id** i resultatet. Slik kan avdelingsbrukere lese morselskapets config (og andre delte ressurser).

### Endring — SQL-migrasjon

Endre funksjonen til å inkludere forelderen:

```sql
CREATE OR REPLACE FUNCTION get_user_visible_company_ids(_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = _user_id 
      AND role IN ('administrator', 'admin', 'superadmin')
    ) THEN
      ARRAY(
        SELECT DISTINCT id FROM (
          -- Own company
          SELECT id FROM companies WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id)
          UNION
          -- Children of own company
          SELECT id FROM companies WHERE parent_company_id = (SELECT company_id FROM profiles WHERE id = _user_id)
          UNION
          -- Parent of own company (NEW)
          SELECT parent_company_id FROM companies WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id) AND parent_company_id IS NOT NULL
        ) sub
      )
    ELSE
      ARRAY(
        SELECT DISTINCT id FROM (
          SELECT company_id AS id FROM profiles WHERE id = _user_id
          UNION
          -- Parent of own company (for reading shared resources)
          SELECT parent_company_id AS id FROM companies WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id) AND parent_company_id IS NOT NULL
        ) sub
      )
  END
$$;
```

### Konsekvensanalyse
Denne funksjonen brukes i RLS-policyer for `company_sora_config` (SELECT), og potensielt andre tabeller. Å inkludere parent betyr at avdelingsbrukere kan **lese** morselskapets data der denne funksjonen brukes. Skrive-policyer bruker `get_user_company_id()` (kun eget selskap), så ingen skrivetilgang til morselskapet gis.

Bør sjekke hvilke andre tabeller som bruker `get_user_visible_company_ids` i RLS for å sikre at dette er ønsket oppførsel overalt.

### Filer
- SQL-migrasjon: oppdater `get_user_visible_company_ids()`
- Ingen kodeendringer nødvendig — frontend-logikken er allerede korrekt

