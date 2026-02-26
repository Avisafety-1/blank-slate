

## Problem

The `handle_new_user()` trigger (migration `20251229134717`) assigns the role `'lesetilgang'` to new users. This is a legacy role value. The current simplified role system uses `bruker`, `administrator`, and `superadmin`. The user wants new users to receive `'administrator'` immediately upon creation.

There is also a separate trigger `auto_assign_admin_on_approval` that assigns `'admin'` (legacy alias for `administrator`) when a user is approved -- but this only fires on approval, not creation.

## Fix

Update the `handle_new_user()` trigger to assign `'administrator'` instead of `'lesetilgang'`.

Additionally, update any existing users stuck with the old `'lesetilgang'` or `'bruker'` role to `'administrator'`.

### Database migration

```sql
-- Update handle_new_user to assign 'administrator' role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, company_id, email, approved)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      NEW.email,
      false
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator');
  END IF;

  RETURN NEW;
END;
$$;

-- Upgrade existing users with legacy/low roles to administrator
-- (skip superadmin users)
UPDATE public.user_roles
SET role = 'administrator'
WHERE role IN ('lesetilgang', 'bruker', 'saksbehandler', 'operatør')
  AND user_id NOT IN (
    SELECT user_id FROM public.user_roles WHERE role = 'superadmin'
  );
```

Single migration, no code changes needed. The `has_role()` function already handles `'administrator'` correctly in the hierarchy.

