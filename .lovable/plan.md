

## Fix: Personelloversikt viser ikke ansatte fra underavdelinger

### Problem
`fetchPersonnel` i `src/hooks/useStatusData.ts` (linje 124) filtrerer med `.eq("company_id", companyId)`, som kun henter personell fra brukerens aktive selskap. For et morselskap (Norconsult) burde det vise personell fra alle underavdelinger (inkl. Bergen).

Droner og utstyr har ikke dette problemet fordi de bruker RLS uten eksplisitt `company_id`-filter.

### Løsning
Erstatt `.eq("company_id", companyId)` med en sjekk mot alle synlige selskaper via `get_user_visible_company_ids`.

**`src/hooks/useStatusData.ts`** — endre `fetchPersonnel`:

```typescript
const fetchPersonnel = async (companyId: string, userId: string) => {
  // Get all visible company IDs for hierarchy support
  const { data: companyIds } = await supabase
    .rpc("get_user_visible_company_ids", { _user_id: userId });

  const visibleIds = companyIds?.length ? companyIds : [companyId];

  const { data, error } = await supabase
    .from("profiles")
    .select("*, personnel_competencies(*), companies(navn)")
    .eq("approved", true)
    .in("company_id", visibleIds);
  
  // ... rest unchanged
};
```

Oppdater kallet til `fetchPersonnel(companyId!, user!.id)` og query-key til å inkludere `user.id`.

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/hooks/useStatusData.ts` | Bruk `get_user_visible_company_ids` i stedet for enkelt `company_id`-filter |

