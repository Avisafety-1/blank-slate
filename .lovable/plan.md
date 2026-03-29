

## Legg til "Intern POC" på kunder

### Oversikt
Legg til et nytt felt `intern_poc_id` (UUID, nullable) på `customers`-tabellen som refererer til `profiles.id`. I kunde-dialogen vises dette som en søkbar dropdown med alle personer i selskapets hierarki (inkl. underavdelinger). Bruker den eksisterende `SearchablePersonSelect`-komponenten.

### 1. Database-migrasjon

```sql
ALTER TABLE public.customers 
ADD COLUMN intern_poc_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
```

### 2. `CustomerManagementDialog.tsx`

- Legg til state `internPocId` (utenfor react-hook-form, siden det er en separat velger)
- Hent personliste via `get_user_visible_company_ids` RPC + profiles-query (samme mønster som `useStatusData`)
- Legg til `SearchablePersonSelect` mellom "Kontaktperson" og "E-post" med label "Intern POC"
- Inkluder `intern_poc_id` i insert/update-payload

### 3. `CustomerManagementSection.tsx`

- Utvid `fetchCustomers` til å joine `profiles` på `intern_poc_id`: `.select("*, intern_poc:profiles!customers_intern_poc_id_fkey(id, full_name)")`
- Vis intern POC-navn i tabellvisning (ny kolonne) og mobilkort

### 4. `CustomerDetailDialog.tsx`

- Vis intern POC-navnet i detaljvisningen

### Filer som endres

| Fil | Endring |
|-----|---------|
| Migrasjon (SQL) | Legg til `intern_poc_id` kolonne |
| `CustomerManagementDialog.tsx` | Søkbar person-velger, lagre POC |
| `CustomerManagementSection.tsx` | Vis POC i tabell/kort, join profiles |
| `CustomerDetailDialog.tsx` | Vis POC i detalj |

