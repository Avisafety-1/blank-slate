

## Gjør kunder tilgjengelig for alle avdelinger i selskapet

### Problem
Kunder som opprettes på morselskapet er kun synlige for morselskapet. Avdelinger (child companies) kan ikke se disse kundene fordi:
1. **RLS SELECT-policy** bruker `get_user_visible_company_ids()` som inkluderer egne + barn, men IKKE morselskap
2. **Frontend** (`CustomerManagementSection`) filtrerer med `.eq("company_id", companyId)` — viser kun egne kunder

### Løsning

#### 1. Database-migrasjon: Oppdater RLS SELECT-policy
Bytt fra `get_user_visible_company_ids` til `get_user_readable_company_ids` i SELECT-policyen på `customers`-tabellen. `get_user_readable_company_ids` inkluderer eget selskap + barn + morselskap.

```sql
DROP POLICY IF EXISTS "Users can view customers from own company" ON customers;
CREATE POLICY "Users can view customers from own company" ON customers
  FOR SELECT USING (
    company_id = ANY(get_user_readable_company_ids(auth.uid()))
  );
```

#### 2. Frontend: Fjern company_id-filter i CustomerManagementSection
Fjern `.eq("company_id", companyId)` fra `fetchCustomers()` slik at RLS styrer tilgangen. Eventuelt vis en badge på kunder som kommer fra morselskapet.

#### 3. Frontend: AddMissionDialog (allerede OK)
Denne henter allerede kunder uten company-filter, så den vil automatisk vise morselskapets kunder når RLS oppdateres.

### Filer som endres
1. **Database-migrasjon** — ny RLS SELECT-policy på `customers`
2. **`src/components/admin/CustomerManagementSection.tsx`** — fjern company_id-filter i `fetchCustomers()`

