

## Problem

When an admin from "Gard HH" (parent company) approves a user in child company "A", the update silently succeeds (no SQL error) but affects 0 rows. This is because the only UPDATE policy on `profiles` is:

```sql
USING ((auth.uid() = id))
```

This means users can only update **their own** profile row. An admin cannot update another user's `approved` field.

The toast says "Bruker godkjent" because Supabase returns no error for 0-row updates, but the database row is unchanged.

## Fix

Add an RLS policy allowing administrators to update profiles within their company (and child companies for parent admins).

### SQL Migration

```sql
-- Allow admins to update profiles in their own company and child companies
CREATE POLICY "Admins can update profiles in own company"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrator')
  AND company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrator')
  AND company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
);
```

This uses the existing `get_user_visible_company_ids` function which returns the user's company plus all child companies, matching the same pattern used across 40+ other tables.

### No frontend changes needed

The `approveUser` function in `Admin.tsx` is already correct -- it just needs the RLS policy to allow the update to actually take effect.

