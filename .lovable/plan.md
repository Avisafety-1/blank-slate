

## Problem
When a new user registers to a child company (e.g., "A"), the notification email is only sent to admins **within that same company**. Since `support@avisafe.no` is an admin of the parent company "Gard HH", they are not found by the query and receive no notification.

The relevant code in `send-notification-email/index.ts` (line 108):
```
profiles.select('id').eq('company_id', companyId)
```
This only matches admins whose `company_id` equals the child company's ID.

## Fix

### Update `send-notification-email/index.ts` — `notify_admins_new_user` handler

After fetching admin roles, also include admins from the **parent company**:

1. Look up the child company's `parent_company_id`
2. If a parent exists, query admin profiles from **both** the child company AND the parent company
3. This ensures parent company admins receive notifications when users register to their child companies

The change is in the edge function only (lines ~104-108), expanding the profiles query:

```typescript
// Fetch parent company id
const { data: childCompany } = await supabase
  .from('companies')
  .select('parent_company_id')
  .eq('id', companyId)
  .single();

const companyIds = [companyId];
if (childCompany?.parent_company_id) {
  companyIds.push(childCompany.parent_company_id);
}

const { data: adminProfiles } = await supabase
  .from('profiles')
  .select('id')
  .in('company_id', companyIds)
  .in('id', adminRoles.map(r => r.user_id));
```

### Files changed
- **`supabase/functions/send-notification-email/index.ts`** — expand admin lookup to include parent company admins

