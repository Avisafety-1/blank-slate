

## Problem

The incidents table has three UPDATE policies that all restrict writes to `company_id = get_user_company_id(auth.uid())`. Since `support@avisafe.no` belongs to the parent company, their `company_id` does not match the child department's `company_id` on the incident. They can **see** the incident (SELECT uses `get_user_visible_company_ids`) but cannot **update** it.

## Solution

Update the UPDATE policies for admins and superadmins on the `incidents` table to use `get_user_visible_company_ids` instead of `get_user_company_id`, matching the same pattern we applied to the `missions` table.

### SQL Migration

```sql
-- Admin UPDATE policy: expand to visible companies
DROP POLICY IF EXISTS "Admins can update incidents in own company" ON incidents;
CREATE POLICY "Admins can update incidents in own company" ON incidents
FOR UPDATE USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'saksbehandler'))
  AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
);

-- Superadmin UPDATE policy: expand to visible companies
DROP POLICY IF EXISTS "Superadmins can update all incidents" ON incidents;
CREATE POLICY "Superadmins can update all incidents" ON incidents
FOR UPDATE USING (
  is_superadmin(auth.uid())
  AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
);
```

The "Users can update own incidents" policy stays unchanged since it's scoped to `auth.uid() = user_id`.

This is the same backward-compatible pattern used for missions -- for companies without departments, `get_user_visible_company_ids` returns only the user's own company ID.

