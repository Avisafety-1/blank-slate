

## Problem

When viewing incidents in a child department, the "Oppfølgingsansvarlig" dropdown only shows users from that department. Users from the parent company (like `support@avisafe.no`) who have `can_be_incident_responsible = true` with `incident_responsible_company_ids = ['all']` are not visible because the profiles RLS policy restricts child department users to only seeing profiles within their own company.

## Root Cause

The profiles SELECT RLS uses `get_user_visible_company_ids(auth.uid())` which for child department users only returns their own `company_id`. Parent company profiles are excluded from the query results entirely.

## Solution

Create a `SECURITY DEFINER` database function `get_incident_responsible_users(target_company_id uuid)` that:
1. Returns all users with `can_be_incident_responsible = true` from the target company
2. Also returns users from the **parent company** who have `incident_responsible_company_ids` containing the target company ID or `'all'`
3. Bypasses RLS to look across company boundaries

Then update the client-side queries in both `IncidentDetailDialog.tsx` and `AddIncidentDialog.tsx` to call this RPC instead of querying profiles directly.

### Changes

| File | Change |
|------|--------|
| SQL Migration | Create `get_incident_responsible_users(uuid)` function |
| `src/components/dashboard/IncidentDetailDialog.tsx` | Replace profiles query with `supabase.rpc('get_incident_responsible_users', { target_company_id: ... })` |
| `src/components/dashboard/AddIncidentDialog.tsx` | Same RPC replacement |

### SQL Function

```sql
CREATE OR REPLACE FUNCTION get_incident_responsible_users(target_company_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Users in the target company who can be incident responsible
  SELECT p.id, p.full_name
  FROM profiles p
  WHERE p.approved = true
    AND p.can_be_incident_responsible = true
    AND p.company_id = target_company_id

  UNION

  -- Users from parent company with scope covering this company
  SELECT p.id, p.full_name
  FROM profiles p
  JOIN companies c ON c.id = target_company_id
  WHERE p.approved = true
    AND p.can_be_incident_responsible = true
    AND c.parent_company_id IS NOT NULL
    AND p.company_id = c.parent_company_id
    AND (
      p.incident_responsible_company_ids @> ARRAY['all']
      OR p.incident_responsible_company_ids @> ARRAY[target_company_id::text]
    )

  ORDER BY full_name ASC;
$$;
```

### Client-side Change

Both dialogs replace the profiles query with:
```typescript
const { data, error } = await supabase.rpc('get_incident_responsible_users', {
  target_company_id: incident?.company_id || companyId
});
```

This is fully backward compatible -- for companies without a parent, the UNION's second branch returns nothing, and the first branch returns the same results as today.

