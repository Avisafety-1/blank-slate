

## Plan: Fix document DELETE RLS policies

### Problem
Two issues prevent document deletion:

1. The DELETE policy "Admins can delete documents in own company" checks `has_role(auth.uid(), 'admin')` but users with the `'administrator'` enum value are not matched — only `'admin'` is. The frontend treats both as admin (line 494 in AuthContext), but RLS does not.

2. The superadmin DELETE policy checks `company_id = get_user_company_id(auth.uid())`, which returns the superadmin's own company (Avisafe). When viewing Kystvakten documents, this check fails because the documents belong to a different company_id.

### Solution — 1 migration

Update the three DELETE policies on `documents`:

#### 1. "Admins can delete documents in own company"
Change from:
```sql
has_role(auth.uid(), 'admin') AND company_id = get_user_company_id(auth.uid())
```
To:
```sql
(has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'administrator'))
AND company_id = get_user_company_id(auth.uid())
```

#### 2. "Superadmins can delete all documents"
Change from:
```sql
is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid())
```
To:
```sql
is_superadmin(auth.uid())
```
This lets superadmins delete documents from any company, matching their broad SELECT access.

#### 3. Also fix UPDATE policies (same pattern)
The "Admins can update" policy has the same `'admin'`-only issue — add `'administrator'` there too. The superadmin UPDATE policy already has a broader "global visibility" variant, so no change needed there.

### Scope
Minimal — 1 migration, no code changes. Fixes both the administrator role gap and the cross-company superadmin restriction.

