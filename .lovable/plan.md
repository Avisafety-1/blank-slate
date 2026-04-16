

## Plan: Allow Parent Company Admins to Manage Competencies Across Hierarchy

### Problem
Current RLS policies on `personnel_competencies` use `get_user_company_id()` which only matches the admin's own company. Parent company admins cannot add/update/delete competencies for users in sub-departments.

### Solution
Update three RLS policies to use `get_user_visible_company_ids()` instead of `get_user_company_id()`, matching the pattern already used by the SELECT policy.

### Database Migration

Replace three policies:

```sql
-- 1. INSERT policy: allow admins to create competencies for users in visible companies
DROP POLICY "Admins can create competencies in own company" ON public.personnel_competencies;
CREATE POLICY "Admins can create competencies in visible companies"
  ON public.personnel_competencies FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role))
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = personnel_competencies.profile_id
        AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- 2. UPDATE policy
DROP POLICY "Admins can update competencies in own company" ON public.personnel_competencies;
CREATE POLICY "Admins can update competencies in visible companies"
  ON public.personnel_competencies FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role))
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = personnel_competencies.profile_id
        AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- 3. DELETE policy
DROP POLICY "Admins can delete competencies in own company" ON public.personnel_competencies;
CREATE POLICY "Admins can delete competencies in visible companies"
  ON public.personnel_competencies FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = personnel_competencies.profile_id
        AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );
```

### No Frontend Changes Needed
The UI already shows personnel from sub-departments via `get_user_visible_company_ids()`. The only blocker is the RLS policies rejecting the insert/update/delete operations.

